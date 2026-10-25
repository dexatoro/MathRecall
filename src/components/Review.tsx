import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Lightbulb, X } from 'lucide-react'
import type { Grade } from 'ts-fsrs'
import { db } from '../db'
import { repository } from '../services/repository'
import { forecast, intervalLabel } from '../services/scheduler'
import { ratingLabels, typeLabels, type ReviewState, type Snapshot } from '../model'
import { MathText } from './MathText'
export function Review({data,ids,onClose}:{data:Snapshot;ids:string[];onClose:()=>void}) {
  const [index,setIndex]=useState(0),[revealed,setRevealed]=useState(false),[hints,setHints]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[lastDue,setLastDue]=useState<Date>()
  const [state,setState]=useState<ReviewState>(),[now,setNow]=useState(()=>new Date()),lock=useRef(false)
  const card=data.cards.find(c=>c.id===ids[index])
  useEffect(()=>{let active=true;setState(undefined); if(ids[index]) void db.states.get(ids[index]).then(s=>{if(active){setState(s);setNow(new Date())}});return()=>{active=false}},[ids,index])
  async function rate(grade:Grade) {
    if(lock.current||!state||!revealed||!card||state.cardId!==card.id)return
    lock.current=true;setBusy(true);setError('')
    try {const next=await repository.rate(card.id,grade,state.reps,new Date());setLastDue(next.due);setRevealed(false);setHints(0);setIndex(i=>i+1)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить оценку')}finally{setBusy(false);lock.current=false}
  }
  const rateRef=useRef(rate);rateRef.current=rate
  useEffect(()=>{function key(e:KeyboardEvent){if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))return;if(e.code==='Space'&&(e.target as HTMLElement).tagName!=='BUTTON'){e.preventDefault();setRevealed(true)}if(['1','2','3','4'].includes(e.key))void rateRef.current(Number(e.key) as Grade)}window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[])
  const preview=state?forecast(state,now,data.settings[0].retention):null
  return <div className="review-screen"><header className="review-header"><span className="wordmark"><span className="logo-mark">m<span>r</span></span> MathRecall</span><span className="muted">{Math.min(index+1,ids.length)} / {ids.length} карточек</span><button className="icon-button" onClick={onClose} aria-label="Завершить повторение"><X size={22}/></button></header><div className="review-progress"><div style={{width:`${index/Math.max(1,ids.length)*100}%`}}/></div>
  {!card?<section className="review-done"><div className="success-icon"><Check size={32}/></div><span className="section-eyebrow">СЕССИЯ ЗАВЕРШЕНА</span><h1>Ещё немного знаний<br/>в долгой памяти.</h1><p className="muted">Сохранено повторений: {index}. Прогресс уже в вашей библиотеке.</p>{lastDue&&<p>Следующее повторение последней карточки: <strong>{lastDue.toLocaleString('ru-RU')}</strong></p>}<button className="button primary" onClick={onClose}>На главную <ArrowRight size={16}/></button></section>:<main className="review-main"><div className="review-meta"><span className={`badge ${card.type}`}>{typeLabels[card.type]}</span><span className="muted small">{data.subjects.find(s=>s.id===card.subjectId)?.name} / {data.topics.find(t=>t.id===card.topicId)?.name??'Без темы'}</span></div><article className="review-question"><MathText>{card.question}</MathText></article>
  {card.hints.slice(0,hints).map((hint,i)=><div key={i} className="hint"><Lightbulb size={17}/><MathText>{hint}</MathText></div>)}
  {hints<card.hints.length&&<button className="button subtle" onClick={()=>setHints(i=>i+1)}><Lightbulb size={16}/> Подсказка {hints+1} из {card.hints.length}</button>}
  {revealed?<><div className="answer"><div className="section-eyebrow">{card.type==='proof'?'ДОКАЗАТЕЛЬСТВО':card.type==='problem'?'РЕШЕНИЕ':'ОТВЕТ'}</div><MathText>{card.answer}</MathText>{card.source&&<p className="muted small">Источник: {card.source}</p>}</div><p className="muted small center">Насколько хорошо вы вспомнили ответ?</p><div className="rating-grid">{([1,2,3,4] as Grade[]).map(grade=><button key={grade} disabled={busy||!preview} className={`rating rating-${grade}`} onClick={()=>void rate(grade)}><span><kbd>{grade}</kbd>{ratingLabels[grade]}</span><small>{preview?intervalLabel(preview[grade].card.due,now):'…'}</small></button>)}</div></>:<div className="reveal-action"><button className="button primary" disabled={!state} onClick={()=>{setNow(new Date());setRevealed(true)}}>Показать ответ <kbd>Space</kbd></button><p className="muted small">Сначала попробуйте вспомнить самостоятельно</p></div>}
  {error&&<p role="alert" className="error">{error}</p>}</main>}</div>
}
