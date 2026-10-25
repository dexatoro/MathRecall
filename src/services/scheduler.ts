import { createEmptyCard, fsrs, type Grade, type Card } from 'ts-fsrs'
import type { ReviewState } from '../model'
export const newState = (cardId:string, now = new Date()):ReviewState => { const empty:Card=createEmptyCard(now); return {...empty,cardId} }
export const scheduler = (retention=.9) => fsrs({request_retention:retention,enable_fuzz:false})
export const forecast = (state:ReviewState, now = new Date(), retention=.9) => scheduler(retention).repeat(state,now)
export function schedule(state:ReviewState, rating:Grade, now = new Date(), retention=.9) { return scheduler(retention).next(state,now,rating) }
export function intervalLabel(due:Date, now = new Date()) {
  const minutes = Math.max(1, Math.round((due.getTime()-now.getTime())/60000))
  if (minutes<60) return `${minutes} мин`
  if (minutes<1440) return `${Math.round(minutes/60)} ч`
  return `${Math.round(minutes/1440)} дн`
}
export function endOfDay(now = new Date()) { const end = new Date(now); end.setHours(23,59,59,999); return end }
export function startOfDay(now = new Date()) { const start = new Date(now); start.setHours(0,0,0,0); return start }
