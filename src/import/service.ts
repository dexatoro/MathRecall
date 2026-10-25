import { db, MathDB } from '../db'
import { timestamps, uid, type Snapshot, type StudyCard, type Topic } from '../model'
import { newState } from '../services/scheduler'
import type { CardDraft } from './model'
import { formatSources, type ExchangeCard } from './schema'
import { parseExchange, validateDraft } from './validation'

export const normalizeName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
const normalizeContent = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ')
export function cardFingerprint(
  value: Pick<ExchangeCard, 'subject' | 'topicPath' | 'type' | 'question' | 'answer'>,
) {
  // Do not lowercase mathematical content: A and a are different symbols.
  return JSON.stringify([
    normalizeName(value.subject),
    value.topicPath.map(normalizeName),
    value.type,
    normalizeContent(value.question),
    normalizeContent(value.answer),
  ])
}
function topicPath(topicId: string | null, topics: Map<string, Topic>) {
  const names: string[] = [],
    seen = new Set<string>()
  let current = topicId
  while (current) {
    const topic = topics.get(current)
    if (!topic || seen.has(current)) break
    seen.add(current)
    names.unshift(topic.name)
    current = topic.parentId
  }
  return names
}
function libraryFingerprints(data: Snapshot) {
  const topics = new Map(data.topics.map((t) => [t.id, t])),
    subjects = new Map(data.subjects.map((s) => [s.id, s]))
  const result = new Map<string, StudyCard>()
  for (const card of [...data.cards].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  )) {
    const subject = subjects.get(card.subjectId)
    if (!subject) continue
    const key = cardFingerprint({
      ...card,
      subject: subject.name,
      topicPath: topicPath(card.topicId, topics),
    })
    if (!result.has(key)) result.set(key, card)
  }
  return result
}
export function duplicateHints(drafts: CardDraft[], data: Snapshot) {
  const library = libraryFingerprints(data),
    pending = new Set<string>(),
    result = new Map<string, string>()
  for (const draft of [...drafts]
    .filter((d) => d.status === 'pending')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))) {
    const key = cardFingerprint(draft.payload)
    if (library.has(key))
      result.set(
        draft.id,
        'Уже есть в библиотеке: при принятии добавятся только недостающие связи с билетами.',
      )
    else if (pending.has(key))
      result.set(
        draft.id,
        'Совпадает с другим черновиком: при принятии будет создана одна карточка.',
      )
    pending.add(key)
  }
  return result
}
export class CardImporter {
  constructor(public database: MathDB = db) {}
  async stage(text: string, label = 'Вставка JSON') {
    const input = parseExchange(text),
      now = new Date(),
      batchId = uid()
    const drafts: CardDraft[] = input.cards.map((payload) => ({
      id: uid(),
      batchId,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      revision: 0,
      payload,
      cardId: null,
    }))
    await this.database.transaction(
      'rw',
      this.database.cardDrafts,
      this.database.importBatches,
      async () => {
        await this.database.importBatches.add({
          id: batchId,
          createdAt: now,
          label: label.trim().slice(0, 200) || 'Вставка JSON',
          format: input.format,
          version: input.version,
          cardCount: drafts.length,
        })
        await this.database.cardDrafts.bulkAdd(drafts)
      },
    )
    return { batchId, count: drafts.length }
  }
  async edit(id: string, payload: unknown, expectedRevision: number) {
    const valid = validateDraft(payload),
      d = this.database
    await d.transaction('rw', d.cardDrafts, async () => {
      const draft = await d.cardDrafts.get(id)
      if (!draft || draft.status !== 'pending' || draft.revision !== expectedRevision)
        throw Error('Черновик уже изменён или обработан. Закройте редактор и откройте его заново.')
      await d.cardDrafts.update(id, {
        payload: valid,
        updatedAt: new Date(),
        revision: draft.revision + 1,
      })
    })
  }
  async reject(ids: string[]) {
    const d = this.database
    await d.transaction('rw', d.cardDrafts, async () => {
      for (const id of new Set(ids)) {
        const draft = await d.cardDrafts.get(id)
        if (draft?.status === 'pending')
          await d.cardDrafts.update(id, {
            status: 'rejected',
            updatedAt: new Date(),
            revision: draft.revision + 1,
          })
      }
    })
  }
  async reopen(id: string) {
    const d = this.database
    await d.transaction('rw', d.cardDrafts, async () => {
      const draft = await d.cardDrafts.get(id)
      if (draft?.status === 'rejected')
        await d.cardDrafts.update(id, {
          status: 'pending',
          updatedAt: new Date(),
          revision: draft.revision + 1,
        })
    })
  }
  async accept(ids: string[]) {
    const d = this.database
    return d.transaction('rw', d.tables, async () => {
      const drafts = (await d.cardDrafts.bulkGet([...new Set(ids)])).filter(
        (draft): draft is CardDraft => !!draft && draft.status === 'pending',
      )
      // Validate the entire selection before making any changes. The transaction also
      // rolls back created subjects, topics and links if a later write fails.
      const parsed = drafts.map((draft) => ({ draft, payload: validateDraft(draft.payload) }))
      const data = await d.snapshot(),
        fingerprints = libraryFingerprints(data)
      const subjects = new Map<string, string[]>(),
        topics = new Map<string, string>(),
        tickets = new Map<string, string>()
      for (const s of [...data.subjects].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
      ))
        subjects.set(normalizeName(s.name), [...(subjects.get(normalizeName(s.name)) ?? []), s.id])
      for (const t of [...data.topics].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
      )) {
        const key = JSON.stringify([t.subjectId, t.parentId, normalizeName(t.name)])
        if (!topics.has(key)) topics.set(key, t.id)
      }
      for (const t of [...data.tickets].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
      )) {
        const key = JSON.stringify([t.topicId, normalizeName(t.name)])
        if (!tickets.has(key)) tickets.set(key, t.id)
      }
      const linked = new Set(data.links.map((l) => JSON.stringify([l.ticketId, l.cardId])))
      let created = 0,
        reused = 0
      for (const { draft, payload } of parsed) {
        const fingerprint = cardFingerprint(payload),
          existing = fingerprints.get(fingerprint)
        const subjectKey = normalizeName(payload.subject)
        let subjectId = existing?.subjectId
        if (!subjectId) {
          // Old libraries may contain same-name subjects. Reuse the one with the
          // longest existing topic prefix before creating any new structure.
          let bestPrefix = -1
          for (const candidate of subjects.get(subjectKey) ?? []) {
            let parentId: string | null = null
            let prefix = 0
            for (const name of payload.topicPath) {
              const found = topics.get(JSON.stringify([candidate, parentId, normalizeName(name)]))
              if (!found) break
              prefix++
              parentId = found
            }
            if (prefix > bestPrefix) {
              subjectId = candidate
              bestPrefix = prefix
            }
          }
        }
        if (!subjectId) {
          subjectId = uid()
          await d.subjects.add({ ...timestamps(), id: subjectId, name: payload.subject })
          subjects.set(subjectKey, [...(subjects.get(subjectKey) ?? []), subjectId])
        }
        let topicId: string | null = existing?.topicId ?? null
        for (const name of existing ? [] : payload.topicPath) {
          const key = JSON.stringify([subjectId, topicId, normalizeName(name)])
          let found = topics.get(key)
          if (!found) {
            found = uid()
            await d.topics.add({ ...timestamps(), id: found, name, subjectId, parentId: topicId })
            topics.set(key, found)
          }
          topicId = found
        }
        const ticketIds: string[] = []
        for (const ticket of payload.tickets) {
          const key = JSON.stringify([topicId, normalizeName(ticket.name)])
          let ticketId = tickets.get(key)
          if (!ticketId) {
            ticketId = uid()
            await d.tickets.add({
              ...timestamps(),
              id: ticketId,
              name: ticket.name,
              description: ticket.description,
              topicId: topicId!,
            })
            tickets.set(key, ticketId)
          }
          ticketIds.push(ticketId)
        }
        let cardId: string
        if (existing) {
          cardId = existing.id
          reused++
        } else {
          cardId = uid()
          const card: StudyCard = {
            ...timestamps(),
            id: cardId,
            subjectId,
            topicId,
            type: payload.type,
            question: payload.question,
            answer: payload.answer,
            hints: payload.hints,
            source: formatSources(payload.sources),
          }
          await d.cards.add(card)
          await d.states.add(newState(cardId))
          fingerprints.set(fingerprint, card)
          created++
        }
        for (const ticketId of ticketIds) {
          const key = JSON.stringify([ticketId, cardId])
          if (!linked.has(key)) {
            await d.links.add({ id: uid(), ticketId, cardId })
            linked.add(key)
          }
        }
        await d.cardDrafts.update(draft.id, {
          status: existing ? 'duplicate' : 'accepted',
          cardId,
          updatedAt: new Date(),
          revision: draft.revision + 1,
        })
      }
      return { created, reused, processed: parsed.length }
    })
  }
}
export const cardImporter = new CardImporter()
