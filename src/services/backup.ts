import { MathDB, db } from '../db'
import { backupSchema, type Backup } from '../model'
export function validateBackup(input: unknown): Backup {
  const data = backupSchema.parse(input)
  for (const key of ['subjects', 'topics', 'tickets', 'cards', 'links', 'logs'] as const) {
    if (new Set(data[key].map((x) => x.id)).size !== data[key].length)
      throw Error(`Повторяющиеся идентификаторы: ${key}`)
  }
  const subjects = new Set(data.subjects.map((s) => s.id)),
    topics = new Map(data.topics.map((t) => [t.id, t])),
    tickets = new Map(data.tickets.map((t) => [t.id, t])),
    cards = new Map(data.cards.map((c) => [c.id, c]))
  for (const t of data.topics) {
    if (!subjects.has(t.subjectId)) throw Error('Тема ссылается на отсутствующий предмет')
    const seen = new Set([t.id])
    let parent = t.parentId
    while (parent) {
      const p = topics.get(parent)
      if (!p || p.subjectId !== t.subjectId || seen.has(parent))
        throw Error('Повреждённое дерево тем')
      seen.add(parent)
      parent = p.parentId
    }
  }
  for (const t of data.tickets)
    if (!topics.has(t.topicId)) throw Error('Билет ссылается на отсутствующую тему')
  for (const c of data.cards)
    if (
      !subjects.has(c.subjectId) ||
      (c.topicId && topics.get(c.topicId)?.subjectId !== c.subjectId)
    )
      throw Error('Повреждена связь карточки с предметом или темой')
  const pairs = new Set<string>()
  for (const l of data.links) {
    const key = `${l.ticketId}:${l.cardId}`
    if (
      !cards.has(l.cardId) ||
      !tickets.has(l.ticketId) ||
      tickets.get(l.ticketId)!.topicId !== cards.get(l.cardId)!.topicId ||
      pairs.has(key)
    )
      throw Error('Некорректная связь билета с карточкой')
    pairs.add(key)
  }
  if (
    data.states.length !== data.cards.length ||
    new Set(data.states.map((s) => s.cardId)).size !== data.cards.length
  )
    throw Error('У каждой карточки должно быть одно состояние FSRS')
  for (const s of data.states)
    if (
      !cards.has(s.cardId) ||
      (s.reps > 0 && !s.last_review) ||
      (s.reps === 0 && s.state !== 0) ||
      (s.state === 0 && s.reps > 0)
    )
      throw Error('Некорректное состояние FSRS')
  for (const l of data.logs)
    if (!cards.has(l.cardId)) throw Error('История ссылается на отсутствующую карточку')
  const logCounts = new Map<string, number>()
  for (const l of data.logs) logCounts.set(l.cardId, (logCounts.get(l.cardId) ?? 0) + 1)
  for (const s of data.states)
    if ((logCounts.get(s.cardId) ?? 0) !== s.reps)
      throw Error('История не соответствует числу повторений')
  return data
}
export async function exportBackup(database: MathDB = db) {
  return database.transaction('r', database.tables, async () => ({
    format: 'MathRecall' as const,
    version: 1 as const,
    exportedAt: new Date(),
    ...(await database.snapshot()),
  }))
}
export async function importBackup(input: unknown, database: MathDB = db) {
  const parsed = validateBackup(input)
  await database.transaction('rw', database.tables, async () => {
    for (const table of database.tables) await table.clear()
    await database.subjects.bulkAdd(parsed.subjects)
    await database.topics.bulkAdd(parsed.topics)
    await database.tickets.bulkAdd(parsed.tickets)
    await database.cards.bulkAdd(parsed.cards)
    await database.links.bulkAdd(parsed.links)
    await database.states.bulkAdd(parsed.states)
    await database.logs.bulkAdd(parsed.logs)
    await database.settings.bulkAdd(parsed.settings)
  })
}
export async function downloadBackup() {
  const blob = new Blob([JSON.stringify(await exportBackup(), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = `mathrecall-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
