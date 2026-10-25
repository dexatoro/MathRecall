import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { Rating } from 'ts-fsrs'
import { MathDB } from '../db'
import { Repository, reviewQueue } from '../services/repository'
import { exportBackup, importBackup, validateBackup } from '../services/backup'
import { timestamps } from '../model'
import { CardImporter, cardFingerprint, duplicateHints } from '../import/service'
import {
  cardExchangeSchema,
  exchangeJsonSchema,
  formatSources,
  type ExchangeCard,
} from '../import/schema'
import { exchangeExample } from '../import/example'
import { generationPrompt } from '../import/prompt'
import { MAX_IMPORT_BYTES, parseExchange, validateExchange } from '../import/validation'
import publishedSchema from '../../public/formats/mathrecall-card-exchange.v1.schema.json'
import publishedExample from '../../public/formats/mathrecall-card-exchange.v1.example.json'
let db: MathDB, importer: CardImporter, repo: Repository
const file = (cards: ExchangeCard[] = exchangeExample.cards) =>
  JSON.stringify({ ...exchangeExample, cards })
beforeEach(async () => {
  db = new MathDB(`exchange-${crypto.randomUUID()}`)
  repo = new Repository(db)
  importer = new CardImporter(db)
  await repo.init()
})
afterEach(async () => {
  await db.delete()
})
async function stage(cards: ExchangeCard[] = exchangeExample.cards) {
  await importer.stage(file(cards))
  return db.cardDrafts.toArray()
}

describe('Версионированный формат обмена', () => {
  it('публичные JSON Schema и пример соответствуют Zod без дрейфа', () => {
    expect(publishedSchema).toEqual(exchangeJsonSchema)
    expect(validateExchange(publishedExample)).toEqual(exchangeExample)
    expect(exchangeJsonSchema.$schema).toContain('2020-12')
    expect(exchangeJsonSchema.additionalProperties).toBe(false)
  })
  it('промпт содержит точную схему, валидный пример и корректное экранирование LaTeX', () => {
    const prompt = generationPrompt()
    expect(prompt).toContain(JSON.stringify(exchangeJsonSchema, null, 2))
    expect(prompt).toContain(JSON.stringify(exchangeExample, null, 2))
    expect(prompt).toContain(JSON.stringify(exchangeExample.cards[0].question))
    const part = prompt
      .split('ПРИМЕР ФОРМАТА (материал карточек замени на присланный мной):\n')[1]
      .split('\n\nТеперь')[0]
    expect(parseExchange(part)).toEqual(exchangeExample)
  })
  it('сохраняет LaTeX, Unicode, переносы и все три типа', () => {
    const parsed = parseExchange(file())
    expect(parsed.cards.map((c) => c.type)).toEqual(['definition', 'proof', 'problem'])
    expect(parsed.cards[0].answer).toContain('\\varepsilon')
    expect(parsed.cards[2].answer).toContain('\n\n$$\n2^n.\n$$')
    expect(parsed).toEqual(exchangeExample)
  })
  it('принимает BOM и одно внешнее Markdown-ограждение', () => {
    expect(parseExchange('\uFEFF```json\n' + file() + '\n```')).toEqual(exchangeExample)
  })
  it('отклоняет повреждённый JSON с понятной подсказкой', () => {
    expect(() => parseExchange('{"question":"\\alpha"}')).toThrow('экранирование LaTeX')
  })
  it('отделяет резервную копию и неизвестные версии', async () => {
    expect(() => validateExchange(awaitableBackup())).toThrow('резервная копия')
    expect(() => validateExchange({ ...exchangeExample, version: 2 })).toThrow('version: 1')
    expect(() => validateBackup(exchangeExample)).toThrow()
    function awaitableBackup() {
      return { format: 'MathRecall', version: 1 }
    }
  })
  it.each([
    'empty',
    'missingAnswer',
    'unknownType',
    'fsrs',
    'orphanTicket',
    'url',
    'malformedUrl',
    'pageRange',
    'pageZero',
    'sourceLength',
  ])('не пишет ничего при неверном файле: %s', async (mode) => {
    const value = structuredClone(exchangeExample) as unknown as {
      cards: Record<string, unknown>[]
    }
    const card = value.cards[0]
    if (mode === 'empty') value.cards = []
    if (mode === 'missingAnswer') delete card.answer
    if (mode === 'unknownType') card.type = 'theorem'
    if (mode === 'fsrs') card.stability = 3
    if (mode === 'orphanTicket') card.topicPath = []
    if (mode === 'malformedUrl')
      card.sources = [{ title: 'X', url: 'no-url', pageStart: null, pageEnd: null }]
    if (mode === 'url')
      card.sources = [
        { title: 'Источник', url: 'javascript:alert(1)', pageStart: null, pageEnd: null },
      ]
    if (mode === 'pageRange')
      card.sources = [{ title: 'Источник', url: null, pageStart: 10, pageEnd: 9 }]
    if (mode === 'pageZero')
      card.sources = [{ title: 'Источник', url: null, pageStart: 0, pageEnd: null }]
    if (mode === 'sourceLength')
      card.sources = Array.from({ length: 10 }, () => ({
        title: 'x'.repeat(200),
        url: 'https://example.org/' + 'a'.repeat(300),
        pageStart: null,
        pageEnd: null,
      }))
    const before = await db.snapshot()
    await expect(importer.stage(JSON.stringify(value))).rejects.toThrow()
    expect(await db.snapshot()).toEqual(before)
    expect(await db.cardDrafts.count()).toBe(0)
    expect(await db.importBatches.count()).toBe(0)
  })
  it('показывает путь проблемного поля и не больше 20 ошибок за раз', () => {
    expect(() =>
      parseExchange(
        JSON.stringify({
          ...exchangeExample,
          cards: [{ ...exchangeExample.cards[0], question: '' }],
        }),
      ),
    ).toThrow('cards[0].question')
    expect(() => parseExchange(' '.repeat(MAX_IMPORT_BYTES + 1))).toThrow('2 МБ')
    expect(() =>
      validateExchange({
        ...exchangeExample,
        cards: Array.from({ length: 501 }, () => exchangeExample.cards[0]),
      }),
    ).toThrow('500')
  })
})
describe('Постоянная очередь черновиков', () => {
  it('импорт не создаёт карточек, тем, билетов и FSRS до принятия', async () => {
    const before = await db.snapshot()
    const result = await importer.stage(file(), 'тест.json')
    expect(result.count).toBe(3)
    expect(await db.snapshot()).toEqual(before)
    expect(await db.cardDrafts.count()).toBe(3)
    expect((await db.importBatches.toArray())[0].label).toBe('тест.json')
    expect(reviewQueue(await db.snapshot(), {})).toHaveLength(0)
  })
  it('сохраняет черновики и источники после переоткрытия IndexedDB', async () => {
    await stage()
    const before = await db.cardDrafts.toArray(),
      name = db.name
    db.close()
    db = new MathDB(name)
    expect(await db.cardDrafts.toArray()).toEqual(before)
  })
  it('редактирует черновик без принятия и запрещает устаревшее редактирование', async () => {
    const [draft] = await stage()
    await importer.edit(draft.id, { ...draft.payload, question: 'Изменено $x$' }, 0)
    expect((await db.cardDrafts.get(draft.id))?.payload.question).toBe('Изменено $x$')
    expect(await db.cards.count()).toBe(0)
    await expect(importer.edit(draft.id, draft.payload, 0)).rejects.toThrow('уже изменён')
  })
  it('не сохраняет неверное редактирование', async () => {
    const [draft] = await stage()
    await expect(importer.edit(draft.id, { ...draft.payload, answer: '' }, 0)).rejects.toThrow()
    expect(await db.cardDrafts.get(draft.id)).toEqual(draft)
  })
  it('отклоняет, возвращает и выборочно принимает черновики', async () => {
    const drafts = await stage()
    await importer.reject([drafts[0].id])
    expect((await db.cardDrafts.get(drafts[0].id))?.status).toBe('rejected')
    expect((await importer.accept([drafts[0].id])).processed).toBe(0)
    await importer.reopen(drafts[0].id)
    await importer.accept([drafts[0].id])
    expect(await db.cards.count()).toBe(1)
    expect(await db.cardDrafts.where('status').equals('pending').count()).toBe(2)
    await expect(importer.edit(drafts[0].id, drafts[0].payload, 2)).rejects.toThrow()
  })
})
describe('Принятие и безопасное объединение', () => {
  it('массовое принятие создаёт предметы, полное дерево тем, билеты, источники и новые FSRS', async () => {
    const drafts = await stage()
    const result = await importer.accept(drafts.map((d) => d.id))
    expect(result).toEqual({ created: 3, reused: 0, processed: 3 })
    expect(await db.subjects.count()).toBe(3)
    expect(await db.topics.count()).toBe(4)
    expect(await db.tickets.count()).toBe(2)
    expect(await db.links.count()).toBe(2)
    expect(await db.logs.count()).toBe(0)
    for (const state of await db.states.toArray()) {
      expect(state.reps).toBe(0)
      expect(state.state).toBe(0)
      expect(state.due).toBeInstanceOf(Date)
    }
    expect(reviewQueue(await db.snapshot(), {})).toHaveLength(3)
    expect((await db.cards.toArray()).some((c) => c.source.includes('с\\. 12–13'))).toBe(true)
    validateBackup(await exportBackup(db))
  })
  it('сохраняет LaTeX и подсказки при принятии и повторном открытии', async () => {
    const [draft] = await stage([exchangeExample.cards[0]])
    await importer.accept([draft.id])
    const name = db.name
    db.close()
    db = new MathDB(name)
    const card = (await db.cards.toArray())[0]
    expect(card.question).toBe(draft.payload.question)
    expect(card.answer).toBe(draft.payload.answer)
    expect(card.hints).toEqual(draft.payload.hints)
  })
  it('ссылки источников ведут к странице и безопасно экранируют название', () => {
    const text = formatSources([
      {
        title: 'Тест [конспект]',
        url: 'https://example.org/notes.pdf#old',
        pageStart: 12,
        pageEnd: 14,
      },
    ])
    expect(text).toContain('https://example.org/notes.pdf#page=12')
    expect(text).toContain('12–14')
    expect(text).toContain('\\[конспект\\]')
    expect(
      cardExchangeSchema.safeParse({
        ...exchangeExample,
        cards: [
          {
            ...exchangeExample.cards[0],
            sources: [{ title: 'X', url: 'data:text/html,x', pageStart: null, pageEnd: null }],
          },
        ],
      }).success,
    ).toBe(false)
  })
  it('дубликаты внутри файла остаются черновиками, но создают одну карточку', async () => {
    const card = exchangeExample.cards[0],
      drafts = await stage([
        card,
        { ...card, subject: '  математический   АНАЛИЗ ', question: ' ' + card.question + '  ' },
      ])
    expect(await db.cardDrafts.count()).toBe(2)
    expect(duplicateHints(drafts, await db.snapshot()).size).toBe(1)
    expect(await importer.accept(drafts.map((d) => d.id))).toEqual({
      created: 1,
      reused: 1,
      processed: 2,
    })
    expect(await db.cards.count()).toBe(1)
    expect(await db.subjects.count()).toBe(3)
    expect(await db.links.count()).toBe(1)
  })
  it('повторный импорт добавляет билет, не меняет карточку, состояние и историю FSRS', async () => {
    const card = exchangeExample.cards[0]
    let drafts = await stage([card])
    await importer.accept(drafts.map((d) => d.id))
    const existing = (await db.cards.toArray())[0]
    await repo.rate(existing.id, Rating.Easy, 0, new Date())
    const beforeState = await db.states.toArray(),
      beforeLogs = await db.logs.toArray()
    drafts = await stage([
      {
        ...card,
        tickets: [...card.tickets, { name: 'Другой билет', description: 'Новая связь' }],
        hints: ['Другие подсказки'],
        sources: [],
      },
    ])
    expect(
      duplicateHints(drafts, await db.snapshot()).get(
        drafts.find((d) => d.status === 'pending')!.id,
      ),
    ).toContain('в библиотеке')
    const result = await importer.accept([drafts.find((d) => d.status === 'pending')!.id])
    expect(result.reused).toBe(1)
    expect(await db.cards.toArray()).toEqual([existing])
    expect(await db.states.toArray()).toEqual(beforeState)
    expect(await db.logs.toArray()).toEqual(beforeLogs)
    expect(await db.links.count()).toBe(2)
    expect(await db.tickets.count()).toBe(2)
  })
  it('не смешивает разные математические символы, ответы и пути тем', () => {
    const card = exchangeExample.cards[0]
    expect(cardFingerprint({ ...card, question: '$A$' })).not.toBe(
      cardFingerprint({ ...card, question: '$a$' }),
    )
    expect(cardFingerprint({ ...card, answer: 'Другой ответ' })).not.toBe(cardFingerprint(card))
    expect(cardFingerprint({ ...card, topicPath: ['Другая тема'] })).not.toBe(cardFingerprint(card))
  })
  it('повторно использует предмет, вложенные темы и билеты без изменения их описаний', async () => {
    const subject = { ...timestamps(), name: 'математический   АНАЛИЗ' }
    await repo.saveSubject(subject)
    const parent = { ...timestamps(), name: 'Раздел', subjectId: subject.id, parentId: null }
    await repo.saveTopic(parent)
    const topic = {
      ...timestamps(),
      name: 'Последовательности',
      subjectId: subject.id,
      parentId: parent.id,
    }
    await repo.saveTopic(topic)
    const ticket = {
      ...timestamps(),
      name: 'Предел монотонной последовательности',
      description: 'Моё описание',
      topicId: topic.id,
    }
    await repo.saveTicket(ticket)
    const drafts = await stage([
      { ...exchangeExample.cards[0], topicPath: ['раздел', 'Последовательности'] },
    ])
    await importer.accept(drafts.map((d) => d.id))
    expect(await db.topics.count()).toBe(2)
    expect(await db.tickets.count()).toBe(1)
    expect((await db.cards.toArray())[0].topicId).toBe(topic.id)
    expect((await db.tickets.get(ticket.id))?.description).toBe('Моё описание')
  })
  it('не создаёт связи в чужой теме при совпадающих названиях предметов в старой базе', async () => {
    const other = { ...timestamps(), name: 'Математический анализ' }
    await repo.saveSubject(other)
    const topic = {
      ...timestamps(),
      name: 'Последовательности',
      subjectId: other.id,
      parentId: null,
    }
    await repo.saveTopic(topic)
    const payload = exchangeExample.cards[0],
      card = {
        ...timestamps(),
        subjectId: other.id,
        topicId: topic.id,
        type: payload.type,
        question: payload.question,
        answer: payload.answer,
        hints: payload.hints,
        source: '',
      }
    await repo.saveCard(card, [])
    const drafts = await stage([payload])
    await importer.accept(drafts.map((d) => d.id))
    expect(await db.cards.count()).toBe(1)
    expect((await db.tickets.toArray())[0].topicId).toBe(topic.id)
    validateBackup(await exportBackup(db))
  })
  it('конкурирующие подтверждения и повторная кнопка не дублируют данные', async () => {
    const drafts = await stage([exchangeExample.cards[0]]),
      ids = drafts.map((d) => d.id)
    const results = await Promise.all([importer.accept(ids), importer.accept(ids)])
    expect(results.reduce((n, r) => n + r.created, 0)).toBe(1)
    expect(await db.cards.count()).toBe(1)
    expect(await db.states.count()).toBe(1)
    expect(await db.links.count()).toBe(1)
  })
  it('два одинаковых пакета при конкурентном принятии сохраняют одну карточку', async () => {
    await stage([exchangeExample.cards[0]])
    await stage([exchangeExample.cards[0]])
    const drafts = await db.cardDrafts.toArray()
    await Promise.all(drafts.map((d) => importer.accept([d.id])))
    expect(await db.cards.count()).toBe(1)
    expect(await db.states.count()).toBe(1)
  })
  it('ошибка записи откатывает весь пакет и сохраняет все черновики', async () => {
    const drafts = await stage(),
      before = await db.snapshot()
    let calls = 0
    const fail = () => {
      if (++calls === 2) throw Error('Ошибка диска')
    }
    db.cards.hook('creating', fail)
    try {
      await expect(importer.accept(drafts.map((d) => d.id))).rejects.toThrow('Ошибка диска')
      expect(await db.snapshot()).toEqual(before)
      expect(await db.cardDrafts.toArray()).toEqual(drafts)
    } finally {
      db.cards.hook('creating').unsubscribe(fail)
    }
  })
  it('полный сценарий: JSON → черновик → принятие → FSRS → сохранение', async () => {
    const [draft] = await stage([exchangeExample.cards[2]])
    await importer.accept([draft.id])
    const data = await db.snapshot(),
      card = reviewQueue(data, {})[0]
    expect(card).toBeDefined()
    await repo.rate(card.id, Rating.Good, 0, new Date())
    const state = (await db.states.get(card.id))!
    expect(state.reps).toBe(1)
    expect(await db.logs.count()).toBe(1)
    expect(state.due.getTime()).toBeGreaterThan(Date.now())
    validateBackup(await exportBackup(db))
  })
})
describe('Совместимость базы и резервной копии v1', () => {
  it('восстанавливает старую копию, не удаляя ожидающие черновики и не меняя формат', async () => {
    const old = await exportBackup(db)
    await stage()
    await importBackup(JSON.parse(JSON.stringify(old)), db)
    expect(await db.cardDrafts.count()).toBe(3)
    expect(await db.importBatches.count()).toBe(1)
    const current = await exportBackup(db)
    expect(Object.keys(current).sort()).toEqual(Object.keys(old).sort())
    expect(current.version).toBe(1)
    expect('cardDrafts' in current).toBe(false)
  })
  it('принятые карточки и ссылки страниц проходят прежний backup round-trip', async () => {
    const [draft] = await stage([
      {
        ...exchangeExample.cards[0],
        sources: [
          { title: 'Конспект', url: 'https://example.org/notes.pdf', pageStart: 3, pageEnd: 5 },
        ],
      },
    ])
    await importer.accept([draft.id])
    const backup = await exportBackup(db)
    await importBackup(JSON.parse(JSON.stringify(backup)), db)
    expect(await db.cards.toArray()).toEqual(backup.cards)
    expect((await db.cards.toArray())[0].source).toContain('#page=3')
  })
  it('мигрирует существующую Dexie v1 без потери карточек и истории', async () => {
    const name = `old-${crypto.randomUUID()}`,
      legacy = new Dexie(name)
    legacy.version(1).stores({
      subjects: 'id,name',
      topics: 'id,subjectId,parentId',
      tickets: 'id,topicId',
      cards: 'id,subjectId,topicId,type',
      links: 'id,ticketId,cardId,&[ticketId+cardId]',
      states: 'cardId,due,state',
      logs: 'id,cardId,review',
      settings: 'id',
    })
    await legacy.open()
    const [draft] = await stage([exchangeExample.cards[0]])
    await importer.accept([draft.id])
    await repo.rate((await db.cards.toArray())[0].id, Rating.Easy, 0, new Date())
    const before = await db.snapshot()
    for (const key of [
      'subjects',
      'topics',
      'tickets',
      'cards',
      'links',
      'states',
      'logs',
      'settings',
    ] as const)
      await legacy.table(key).bulkAdd(before[key])
    legacy.close()
    const migrated = new MathDB(name)
    try {
      expect(await migrated.snapshot()).toEqual(before)
      expect(await migrated.cardDrafts.count()).toBe(0)
      expect(migrated.verno).toBe(2)
    } finally {
      await migrated.delete()
    }
  })
})
