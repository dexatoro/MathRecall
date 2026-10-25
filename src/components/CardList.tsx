import { BookOpen, GraduationCap, CircleHelp, ChevronRight } from 'lucide-react'
import { typeLabels, type Snapshot, type StudyCard } from '../model'
export function CardList({
  cards,
  data,
  now,
  onSelect,
}: {
  cards: StudyCard[]
  data: Snapshot
  now: Date
  onSelect: (card: StudyCard) => void
}) {
  const states = new Map(data.states.map((s) => [s.cardId, s]))
  return (
    <div className="card-list">
      {cards.map((c) => {
        const state = states.get(c.id)
        return (
          <button className="card-row" key={c.id} onClick={() => onSelect(c)}>
            <span className={`card-type-icon ${c.type}`}>
              {c.type === 'definition' ? (
                <BookOpen size={18} />
              ) : c.type === 'proof' ? (
                <GraduationCap size={19} />
              ) : (
                <CircleHelp size={18} />
              )}
            </span>
            <div className="card-row-content">
              <span className="card-question-text">{c.question}</span>
              <span className="muted small">
                {data!.subjects.find((s) => s.id === c.subjectId)?.name}{' '}
                <span className="dot">·</span>{' '}
                {data!.topics.find((t) => t.id === c.topicId)?.name ?? 'Без темы'}
              </span>
            </div>
            <span className={`badge ${c.type}`}>{typeLabels[c.type]}</span>
            <span className="due small">
              {state?.state === 0
                ? 'Новая'
                : state && state.due <= now
                  ? 'Пора повторить'
                  : state?.due.toLocaleString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
            </span>
            <ChevronRight size={16} className="muted" />
          </button>
        )
      })}
    </div>
  )
}
