import { z } from 'zod'

const name = z.string().trim().min(1).max(200)
const content = z.string().trim().min(1).max(20000)
const page = z.number().int().min(1).max(100000)
export const sourceReferenceSchema = z
  .object({
    title: name,
    url: z
      .url()
      .max(1000)
      .regex(/^https?:\/\//, 'Разрешены только ссылки http:// и https://')
      .nullable(),
    pageStart: page.nullable(),
    pageEnd: page.nullable(),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (
      source.pageEnd !== null &&
      (source.pageStart === null || source.pageEnd < source.pageStart)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['pageEnd'],
        message: 'Конечная страница должна быть не меньше начальной; укажите pageStart',
      })
    }
  })
export const exchangeCardSchema = z
  .object({
    type: z.enum(['definition', 'proof', 'problem']),
    subject: name,
    topicPath: z.array(name).max(12),
    tickets: z.array(z.object({ name, description: z.string().max(20000) }).strict()).max(30),
    question: content,
    answer: content,
    hints: z.array(content).max(100),
    sources: z.array(sourceReferenceSchema).max(10),
  })
  .strict()
  .superRefine((card, ctx) => {
    if (!card.topicPath.length && card.tickets.length)
      ctx.addIssue({
        code: 'custom',
        path: ['tickets'],
        message: 'Для билетов укажите непустой topicPath: билет должен принадлежать теме',
      })
    if (formatSources(card.sources).length > 2000)
      ctx.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'Ссылки на источники после форматирования должны занимать не более 2000 символов',
      })
  })
export const cardExchangeSchema = z
  .object({
    format: z.literal('MathRecall.CardExchange'),
    version: z.literal(1),
    cards: z.array(exchangeCardSchema).min(1).max(500),
  })
  .strict()
export type ExchangeCard = z.infer<typeof exchangeCardSchema>
export type ExchangeFile = z.infer<typeof cardExchangeSchema>
export type SourceReference = z.infer<typeof sourceReferenceSchema>

function escapeMarkdown(text: string) {
  return text.replace(/[\\`*{}[\]<>()#+.!_|]/g, '\\$&')
}
export function formatSources(sources: SourceReference[]) {
  return sources
    .map((source) => {
      const pages =
        source.pageStart === null
          ? ''
          : ` · с. ${source.pageStart}${source.pageEnd !== null && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ''}`
      const label = escapeMarkdown(source.title + pages)
      if (!source.url) return label
      let url: URL
      try {
        url = new URL(source.url)
      } catch {
        return label
      }
      if (source.pageStart !== null) url.hash = `page=${source.pageStart}`
      return `[${label}](<${url.href}>)`
    })
    .join('\n\n')
}
export const exchangeJsonSchema = {
  ...z.toJSONSchema(cardExchangeSchema, { target: 'draft-2020-12', io: 'input' }),
  $id: 'urn:mathrecall:card-exchange:1',
  title: 'MathRecall Card Exchange v1',
  description:
    'Обмен учебными карточками, не резервная копия. Не содержит UUID, FSRS и историю. Дополнительные проверки Zod: pageEnd >= pageStart, билеты требуют topicPath, итоговое поле источников <= 2000 символов.',
}
