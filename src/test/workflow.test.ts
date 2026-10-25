import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { fsrs, Rating } from 'ts-fsrs'
import { MathDB } from '../db'
import { Repository, scopedCards, reviewQueue } from '../services/repository'
import { exportBackup, importBackup, validateBackup } from '../services/backup'
import { timestamps, type StudyCard } from '../model'
import { endOfDay, startOfDay, intervalLabel, newState } from '../services/scheduler'
let db: MathDB, repo: Repository
const now = new Date('2026-10-25T10:00:00.000Z')
beforeEach(async () => {
  db = new MathDB(`test-${crypto.randomUUID()}`)
  repo = new Repository(db)
  await repo.init()
})
afterEach(async () => {
  await db.delete()
})
async function fixture(type: StudyCard['type'] = 'definition') {
  const subject = { ...timestamps(), name: 'Анализ' }
  await repo.saveSubject(subject)
  const topic = {
    ...timestamps(),
    name: 'Последовательности',
    subjectId: subject.id,
    parentId: null,
  }
  await repo.saveTopic(topic)
  const ticket = {
    ...timestamps(),
    name: 'Монотонная последовательность',
    description: 'Экзаменационный вопрос',
    topicId: topic.id,
  }
  await repo.saveTicket(ticket)
  const card: StudyCard = {
    ...timestamps(),
    subjectId: subject.id,
    topicId: topic.id,
    type,
    question: 'Что значит $a_n \\to a$?',
    answer: 'Для каждого $\\varepsilon>0$…',
    hints: ['Используйте кванторы.'],
    source: 'Конспект',
  }
  await repo.saveCard(card, [ticket.id])
  await db.states.put(newState(card.id, now))
  return { subject, topic, ticket, card }
}
describe('Библиотека', () => {
  it('создаёт начальные предметы один раз', async () => {
    await repo.init()
    expect(await db.subjects.count()).toBe(3)
    expect(await db.cards.count()).toBe(0)
  })
  it.each(['definition', 'proof', 'problem'] as const)(
    'создаёт и редактирует %s с билетами',
    async (type) => {
      const f = await fixture(type)
      await repo.saveCard({ ...f.card, answer: 'Новый ответ' }, [f.ticket.id, f.ticket.id])
      expect((await db.cards.get(f.card.id))?.answer).toBe('Новый ответ')
      expect(await db.links.count()).toBe(1)
      expect(await db.states.count()).toBe(1)
    },
  )
  it('переименовывает предмет, тему и билет', async () => {
    const f = await fixture()
    await repo.saveSubject({ ...f.subject, name: 'Матан' })
    await repo.saveTopic({ ...f.topic, name: 'Пределы' })
    await repo.saveTicket({ ...f.ticket, name: 'Билет 1' })
    expect((await db.subjects.get(f.subject.id))?.name).toBe('Матан')
    expect((await db.topics.get(f.topic.id))?.name).toBe('Пределы')
    expect((await db.tickets.get(f.ticket.id))?.name).toBe('Билет 1')
  })
  it('одна карточка в двух билетах имеет одно состояние', async () => {
    const f = await fixture()
    const t = { ...f.ticket, ...timestamps(), name: 'Второй билет' }
    await repo.saveTicket(t)
    await repo.saveCard(f.card, [f.ticket.id, t.id])
    await repo.rate(f.card.id, Rating.Good, 0, now)
    const data = await db.snapshot()
    expect(scopedCards(data, { ticketId: t.id }).length).toBe(1)
    expect(scopedCards(data, { ticketId: f.ticket.id }).length).toBe(1)
    expect(await db.states.count()).toBe(1)
    expect(data.states[0].reps).toBe(1)
  })
  it('включает вложенные темы в фильтр и запрещает циклы', async () => {
    const f = await fixture()
    const child = { ...f.topic, ...timestamps(), name: 'Подтема', parentId: f.topic.id }
    await repo.saveTopic(child)
    await repo.saveCard({ ...f.card, topicId: child.id }, [])
    expect(scopedCards(await db.snapshot(), { topicId: f.topic.id })).toHaveLength(1)
    await expect(repo.saveTopic({ ...f.topic, parentId: child.id })).rejects.toThrow()
  })
  it('отклоняет пустую карточку и ссылки на чужой предмет без частичной записи', async () => {
    const f = await fixture()
    await expect(repo.saveCard({ ...f.card, question: '   ' }, [])).rejects.toThrow()
    const other = (await db.subjects.toArray()).find((s) => s.id !== f.subject.id)!
    await expect(repo.saveCard({ ...f.card, subjectId: other.id }, [])).rejects.toThrow()
    expect((await db.cards.get(f.card.id))?.question).toBe(f.card.question)
    expect(await db.links.count()).toBe(1)
  })
  it('отклоняет ссылку на билет другой темы', async () => {
    const f = await fixture()
    const topic = { ...f.topic, ...timestamps() }
    await repo.saveTopic(topic)
    const ticket = { ...f.ticket, ...timestamps(), topicId: topic.id }
    await repo.saveTicket(ticket)
    await expect(repo.saveCard(f.card, [ticket.id])).rejects.toThrow()
    expect(await db.links.count()).toBe(1)
  })
  it('удаляет только билет, сохраняя карточку и FSRS', async () => {
    const f = await fixture()
    await repo.remove('ticket', f.ticket.id)
    expect(await db.tickets.count()).toBe(0)
    expect(await db.links.count()).toBe(0)
    expect(await db.cards.count()).toBe(1)
    expect(await db.states.count()).toBe(1)
  })
  it.each(['card', 'topic', 'subject'] as const)(
    'каскадно удаляет %s без осиротевших записей',
    async (kind) => {
      const f = await fixture()
      await repo.rate(f.card.id, Rating.Easy, 0, now)
      await repo.remove(kind, f[kind].id)
      expect(await db.cards.count()).toBe(0)
      expect(await db.states.count()).toBe(0)
      expect(await db.links.count()).toBe(0)
      expect(await db.logs.count()).toBe(0)
      if (kind !== 'card') expect(await db.tickets.count()).toBe(0)
    },
  )
  it('удаляет потомков темы', async () => {
    const f = await fixture()
    const child = { ...f.topic, ...timestamps(), parentId: f.topic.id }
    await repo.saveTopic(child)
    await repo.saveCard({ ...f.card, topicId: child.id }, [])
    await repo.remove('topic', f.topic.id)
    expect(await db.topics.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
  })
})
describe('FSRS и сохранение', () => {
  it.each([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const)(
    'оценка %s совпадает с настоящей библиотекой FSRS',
    async (grade) => {
      const f = await fixture()
      const before = (await db.states.get(f.card.id))!
      const expected = fsrs({ enable_fuzz: false, request_retention: 0.9 }).next(before, now, grade)
      await repo.rate(f.card.id, grade, 0, now)
      const actual = await db.states.get(f.card.id)
      expect(actual).toEqual({ ...expected.card, cardId: f.card.id })
      expect((await db.logs.toArray())[0]).toMatchObject(expected.log)
      expect(actual!.due > now).toBe(true)
    },
  )
  it('после закрытия и повторного открытия базы сохраняются состояние и история', async () => {
    const f = await fixture()
    await repo.rate(f.card.id, Rating.Easy, 0, now)
    const before = await db.snapshot()
    const name = db.name
    db.close()
    db = new MathDB(name)
    expect(await db.snapshot()).toEqual(before)
  })
  it('защищает от двойной оценки конкурирующими транзакциями', async () => {
    const f = await fixture()
    const result = await Promise.allSettled([
      repo.rate(f.card.id, Rating.Good, 0, now),
      repo.rate(f.card.id, Rating.Easy, 0, now),
    ])
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.logs.count()).toBe(1)
    expect((await db.states.get(f.card.id))?.reps).toBe(1)
  })
  it('не допускает преждевременное повторение', async () => {
    const f = await fixture()
    await repo.rate(f.card.id, Rating.Easy, 0, now)
    await expect(repo.rate(f.card.id, Rating.Good, 1, now)).rejects.toThrow('не наступило')
  })
  it('повторяет карточку на следующем сроке, сохраняя все поля', async () => {
    const f = await fixture()
    const first = await repo.rate(f.card.id, Rating.Easy, 0, now)
    const next = new Date(first.due.getTime() + 60000)
    await repo.rate(f.card.id, Rating.Good, 1, next)
    expect((await db.states.get(f.card.id))?.reps).toBe(2)
    expect(await db.logs.count()).toBe(2)
    validateBackup(await exportBackup(db))
  })
  it('уважает общий дневной лимит новых и включает просроченные', async () => {
    const f = await fixture()
    await db.settings.update('main', { newLimit: 1 })
    const second = { ...f.card, ...timestamps() }
    await repo.saveCard(second, [])
    await db.states.put(newState(second.id, now))
    expect(reviewQueue(await db.snapshot(), {}, now)).toHaveLength(1)
    await repo.rate(f.card.id, Rating.Good, 0, now)
    expect(reviewQueue(await db.snapshot(), {}, now)).toHaveLength(0)
    expect(reviewQueue(await db.snapshot(), {}, new Date(now.getTime() + 20 * 60000))).toHaveLength(
      1,
    )
  })
  it('форматирует интервалы и границы локальных суток', () => {
    expect(startOfDay(now).getHours()).toBe(0)
    expect(endOfDay(now).getHours()).toBe(23)
    expect(intervalLabel(new Date(now.getTime() + 60000), now)).toBe('1 мин')
    expect(intervalLabel(new Date(now.getTime() + 2 * 86400000), now)).toBe('2 дн')
  })
})
describe('Резервные копии', () => {
  it('export → JSON → import восстанавливает все данные и даты без потерь', async () => {
    const f = await fixture('proof')
    await repo.rate(f.card.id, Rating.Easy, 0, now)
    const exported = await exportBackup(db)
    await repo.remove('subject', f.subject.id)
    await importBackup(JSON.parse(JSON.stringify(exported)), db)
    expect(await db.snapshot()).toEqual({
      subjects: exported.subjects,
      topics: exported.topics,
      tickets: exported.tickets,
      cards: exported.cards,
      links: exported.links,
      states: exported.states,
      logs: exported.logs,
      settings: exported.settings,
    })
    expect((await db.states.toArray())[0].due).toBeInstanceOf(Date)
  })
  it.each([
    'version',
    'orphan',
    'duplicate',
    'cycle',
    'missingState',
    'badDate',
    'badState',
    'logMismatch',
  ])('не изменяет данные при ошибочном импорте: %s', async (mode) => {
    await fixture()
    const before = await db.snapshot()
    const parsed = JSON.parse(JSON.stringify(await exportBackup(db)))
    if (mode === 'version') parsed.version = 99
    if (mode === 'orphan') parsed.cards[0].subjectId = crypto.randomUUID()
    if (mode === 'duplicate') parsed.cards.push(parsed.cards[0])
    if (mode === 'cycle') parsed.topics[0].parentId = parsed.topics[0].id
    if (mode === 'missingState') parsed.states = []
    if (mode === 'badDate') parsed.states[0].due = 'garbage'
    if (mode === 'badState') parsed.states[0].difficulty = -1
    if (mode === 'logMismatch') parsed.states[0].reps = 10
    await expect(importBackup(parsed, db)).rejects.toThrow()
    expect(await db.snapshot()).toEqual(before)
  })
  it('откатывает всю замену при ошибке записи IndexedDB', async () => {
    await fixture()
    const before = await db.snapshot()
    const exported = await exportBackup(db)
    const hook = () => {
      throw Error('Искусственная ошибка записи')
    }
    db.cards.hook('creating', hook)
    try {
      await expect(importBackup(exported, db)).rejects.toThrow()
      expect(await db.snapshot()).toEqual(before)
    } finally {
      db.cards.hook('creating').unsubscribe(hook)
    }
  })
})
