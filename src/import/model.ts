import type { ExchangeCard } from './schema'
export type CardDraft = {
  id: string
  batchId: string
  createdAt: Date
  updatedAt: Date
  revision: number
  status: 'pending' | 'accepted' | 'rejected' | 'duplicate'
  payload: ExchangeCard
  cardId: string | null
}
export type ImportBatch = {
  id: string
  createdAt: Date
  label: string
  format: 'MathRecall.CardExchange'
  version: 1
  cardCount: number
}
