import { MathDB, db } from '../db'
import { cardSchema, defaultSettings, settingsSchema, subjectSchema, ticketSchema, topicSchema, timestamps, uid, type StudyCard, type Subject, type Topic, type Ticket, type Snapshot } from '../model'
import { newState, schedule, startOfDay } from './scheduler'
import type { Grade } from 'ts-fsrs'
export type Scope = { subjectId?:string; topicId?:string; ticketId?:string }
export function topicDescendants(topics:Topic[], root:string) {
  const ids = new Set([root]); let size=0
  while(size!==ids.size) { size=ids.size; topics.forEach(t=>{if(t.parentId&&ids.has(t.parentId)) ids.add(t.id)}) }
  return ids
}
export function scopedCards(data:Snapshot, scope:Scope) {
  const topics = scope.topicId ? topicDescendants(data.topics,scope.topicId) : null
  const links = scope.ticketId ? new Set(data.links.filter(l=>l.ticketId===scope.ticketId).map(l=>l.cardId)) : null
  return data.cards.filter(c=>(!scope.subjectId||c.subjectId===scope.subjectId)&&(!topics||!!c.topicId&&topics.has(c.topicId))&&(!links||links.has(c.id)))
}
export function reviewQueue(data:Snapshot, scope:Scope, now = new Date()) {
  const states = new Map(data.states.map(s=>[s.cardId,s]))
  const introduced = new Set(data.logs.filter(l=>l.review>=startOfDay(now)&&l.state===0).map(l=>l.cardId)).size
  let remaining = Math.max(0,(data.settings[0]?.newLimit??20)-introduced)
  return scopedCards(data,scope).filter(c=>{const s=states.get(c.id); return s&&s.due<=now}).sort((a,b)=>{ const sa=states.get(a.id)!,sb=states.get(b.id)!; return Number(sa.state===0)-Number(sb.state===0)||sa.due.getTime()-sb.due.getTime() }).filter(c=>states.get(c.id)!.state!==0||remaining-->0)
}
export class Repository {
  constructor(public database:MathDB=db) {}
  async init() {
    const d=this.database
    await d.transaction('rw',d.tables,async()=>{
      if(await d.settings.get('main')) return
      const names=['Математический анализ','Алгебра','Дискретная математика']
      await d.subjects.bulkAdd(names.map(name=>({...timestamps(),name})))
      await d.settings.add(defaultSettings)
    })
  }
  async saveSubject(value:Subject) { await this.database.subjects.put(subjectSchema.parse(value)) }
  async saveTopic(value:Topic) {
    const d=this.database, item=topicSchema.parse(value)
    await d.transaction('rw',d.topics,d.subjects,async()=>{
      if(!await d.subjects.get(item.subjectId)) throw Error('Предмет не найден')
      if(item.parentId) {
        const parent=await d.topics.get(item.parentId)
        if(!parent||parent.subjectId!==item.subjectId||topicDescendants(await d.topics.toArray(),item.id).has(item.parentId)) throw Error('Недопустимая родительская тема')
      }
      await d.topics.put(item)
    })
  }
  async saveTicket(value:Ticket) {
    const d=this.database,item=ticketSchema.parse(value)
    await d.transaction('rw',d.tickets,d.topics,d.links,d.cards,async()=>{
      if(!await d.topics.get(item.topicId)) throw Error('Тема не найдена')
      const links=await d.links.where('ticketId').equals(item.id).toArray()
      for(const link of links) { const c=await d.cards.get(link.cardId); if(c?.topicId!==item.topicId) throw Error('Нельзя перенести билет с карточками в другую тему') }
      await d.tickets.put(item)
    })
  }
  async saveCard(value:StudyCard, ticketIds:string[]) {
    const d=this.database,item=cardSchema.parse(value)
    await d.transaction('rw',d.tables,async()=>{
      if(!await d.subjects.get(item.subjectId)) throw Error('Предмет не найден')
      if(item.topicId) { const t=await d.topics.get(item.topicId); if(!t||t.subjectId!==item.subjectId) throw Error('Тема не принадлежит предмету') }
      for(const ticketId of ticketIds) { const t=await d.tickets.get(ticketId); if(!t||t.topicId!==item.topicId) throw Error('Билет не принадлежит теме карточки') }
      await d.cards.put(item)
      await d.links.where('cardId').equals(item.id).delete()
      await d.links.bulkAdd([...new Set(ticketIds)].map(ticketId=>({id:uid(),ticketId,cardId:item.id})))
      if(!await d.states.get(item.id)) await d.states.add(newState(item.id))
    })
  }
  async remove(kind:'subject'|'topic'|'ticket'|'card', id:string) {
    const d=this.database
    await d.transaction('rw',d.tables,async()=>{
      if(kind==='ticket') { await d.links.where('ticketId').equals(id).delete(); await d.tickets.delete(id); return }
      const topicIds=kind==='subject'? new Set((await d.topics.where('subjectId').equals(id).toArray()).map(t=>t.id)) : kind==='topic'?topicDescendants(await d.topics.toArray(),id):new Set<string>()
      const cards=(await d.cards.toArray()).filter(c=>kind==='card'?c.id===id:kind==='subject'?c.subjectId===id:!!c.topicId&&topicIds.has(c.topicId))
      const cardIds=new Set(cards.map(c=>c.id))
      const tickets=(await d.tickets.toArray()).filter(t=>topicIds.has(t.topicId))
      const ticketIds=new Set(tickets.map(t=>t.id))
      await d.links.filter(l=>cardIds.has(l.cardId)||ticketIds.has(l.ticketId)).delete()
      await d.logs.filter(l=>cardIds.has(l.cardId)).delete()
      await d.states.bulkDelete([...cardIds]); await d.cards.bulkDelete([...cardIds])
      await d.tickets.bulkDelete([...ticketIds]); await d.topics.bulkDelete([...topicIds])
      if(kind==='subject') await d.subjects.delete(id)
    })
  }
  async rate(cardId:string, grade:Grade, expectedReps:number, now = new Date()) {
    const d=this.database
    return d.transaction('rw',d.states,d.logs,d.settings,async()=>{
      const state=await d.states.get(cardId)
      if(!state||state.reps!==expectedReps) throw Error('Это повторение уже сохранено или карточка изменилась')
      if(state.due>now) throw Error('Время повторения ещё не наступило')
      const {card,log}=schedule(state,grade,now,(await d.settings.get('main'))?.retention)
      await d.states.put({cardId,...card}); await d.logs.add({id:uid(),cardId,...log})
      return card
    })
  }
  async saveSettings(value:unknown) { await this.database.settings.put(settingsSchema.parse(value)) }
}
export const repository=new Repository()
