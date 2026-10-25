import { z } from 'zod'
const id = z.uuid()
const date = z.union([z.date(), z.iso.datetime().transform((v) => new Date(v))])
const text = z.string().trim().min(1).max(20000)
const base = { id, createdAt: date, updatedAt: date }
export const subjectSchema = z.object({ ...base, name: text.max(200) }).strict()
export const topicSchema = z
  .object({ ...base, name: text.max(200), subjectId: id, parentId: id.nullable() })
  .strict()
export const ticketSchema = z
  .object({ ...base, name: text.max(200), description: z.string().max(20000), topicId: id })
  .strict()
export const cardSchema = z
  .object({
    ...base,
    subjectId: id,
    topicId: id.nullable(),
    type: z.enum(['definition', 'proof', 'problem']),
    question: text,
    answer: text,
    hints: z.array(text).max(100),
    source: z.string().max(2000),
  })
  .strict()
export const linkSchema = z.object({ id, ticketId: id, cardId: id }).strict()
const nonnegative = z.number().finite().nonnegative()
const integer = nonnegative.int()
export const stateSchema = z
  .object({
    cardId: id,
    due: date,
    stability: nonnegative,
    difficulty: z.number().min(0).max(10),
    elapsed_days: nonnegative,
    scheduled_days: nonnegative,
    reps: integer,
    lapses: integer,
    learning_steps: integer,
    state: z.number().int().min(0).max(3),
    last_review: date.optional(),
  })
  .strict()
export const logSchema = z
  .object({
    id,
    cardId: id,
    rating: z.number().int().min(1).max(4),
    state: z.number().int().min(0).max(3),
    due: date,
    stability: nonnegative,
    difficulty: z.number().min(0).max(10),
    elapsed_days: nonnegative,
    last_elapsed_days: nonnegative,
    scheduled_days: nonnegative,
    learning_steps: integer,
    review: date,
  })
  .strict()
export const settingsSchema = z
  .object({
    id: z.literal('main'),
    theme: z.enum(['dark', 'light']),
    retention: z.number().min(0.7).max(0.97),
    newLimit: z.number().int().min(1).max(500),
    initialized: z.literal(true),
  })
  .strict()
export const backupSchema = z
  .object({
    format: z.literal('MathRecall'),
    version: z.literal(1),
    exportedAt: date,
    subjects: z.array(subjectSchema),
    topics: z.array(topicSchema),
    tickets: z.array(ticketSchema),
    cards: z.array(cardSchema),
    links: z.array(linkSchema),
    states: z.array(stateSchema),
    logs: z.array(logSchema),
    settings: z.array(settingsSchema).length(1),
  })
  .strict()
export type Subject = z.infer<typeof subjectSchema>
export type Topic = z.infer<typeof topicSchema>
export type Ticket = z.infer<typeof ticketSchema>
export type StudyCard = z.infer<typeof cardSchema>
export type TicketCard = z.infer<typeof linkSchema>
export type ReviewState = z.infer<typeof stateSchema>
export type ReviewLog = z.infer<typeof logSchema>
export type Settings = z.infer<typeof settingsSchema>
export type Backup = z.infer<typeof backupSchema>
export type Snapshot = Omit<Backup, 'format' | 'version' | 'exportedAt'>
export const defaultSettings: Settings = {
  id: 'main',
  theme: 'dark',
  retention: 0.9,
  newLimit: 20,
  initialized: true,
}
export const typeLabels = { definition: 'Определение', proof: 'Доказательство', problem: 'Задача' }
export const stateLabels = ['Новая', 'Изучается', 'Повторение', 'Переучивание']
export const ratingLabels = ['', 'Снова', 'Трудно', 'Хорошо', 'Легко']
export const uid = () => crypto.randomUUID()
export const timestamps = () => ({ id: uid(), createdAt: new Date(), updatedAt: new Date() })
