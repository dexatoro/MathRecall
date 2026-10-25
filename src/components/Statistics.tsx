import type { Snapshot } from '../model'
import { stateLabels, ratingLabels } from '../model'
import { startOfDay, endOfDay } from '../services/scheduler'
export function Statistics({ data, now }: { data: Snapshot; now: Date }) {
  const doneToday = data.logs.filter((l) => l.review >= startOfDay(now)).length
  return (
    <>
      <div className="metrics">
        <div>
          <span className="metric-label">Всего карточек</span>
          <strong>{data.cards.length}</strong>
        </div>
        <div>
          <span className="metric-label">Всего повторений</span>
          <strong>{data.logs.length}</strong>
        </div>
        <div>
          <span className="metric-label">Повторено сегодня</span>
          <strong>{doneToday}</strong>
        </div>
      </div>
      <div className="stats-grid">
        <section className="panel">
          <h2>Последние 7 дней</h2>
          <div className="activity-bars">
            {Array.from({ length: 7 }, (_, i) => {
              const day = startOfDay(now)
              day.setDate(day.getDate() - 6 + i)
              const end = endOfDay(day),
                count = data.logs.filter((l) => l.review >= day && l.review <= end).length
              const max = Math.max(
                1,
                ...Array.from({ length: 7 }, (_, j) => {
                  const d = startOfDay(now)
                  d.setDate(d.getDate() - j)
                  return data.logs.filter((l) => l.review >= d && l.review <= endOfDay(d)).length
                }),
              )
              return (
                <div key={i} className="bar-column">
                  <span>{count}</span>
                  <div className="bar-track">
                    <div style={{ height: `${(count / max) * 100}%` }} />
                  </div>
                  <small>{day.toLocaleDateString('ru-RU', { weekday: 'short' })}</small>
                </div>
              )
            })}
          </div>
        </section>
        <section className="panel">
          <h2>Состояния карточек</h2>
          {stateLabels.map((label, i) => (
            <div className="stat-row" key={label}>
              <span>{label}</span>
              <strong>{data.states.filter((s) => s.state === i).length}</strong>
            </div>
          ))}
          <p className="muted small">«Повторение» — карточки, прошедшие начальные шаги FSRS.</p>
        </section>
        <section className="panel">
          <h2>Предстоящие 7 дней</h2>
          {Array.from({ length: 7 }, (_, i) => {
            const day = startOfDay(now)
            day.setDate(day.getDate() + i)
            return (
              <div className="stat-row" key={i}>
                <span>
                  {i === 0
                    ? 'Сегодня, включая просроченные'
                    : day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                </span>
                <strong>
                  {
                    data.states.filter((s) => (i === 0 || s.due >= day) && s.due <= endOfDay(day))
                      .length
                  }
                </strong>
              </div>
            )
          })}
          <p className="muted small">
            Текущие даты следующего повторения. Новые оценки изменят нагрузку.
          </p>
        </section>
        <section className="panel">
          <h2>Последние оценки</h2>
          {data.logs.length ? (
            [...data.logs]
              .sort((a, b) => b.review.getTime() - a.review.getTime())
              .slice(0, 10)
              .map((l) => (
                <div className="log-row" key={l.id}>
                  <span className="truncate">
                    {data.cards.find((c) => c.id === l.cardId)?.question}
                  </span>
                  <span className={`grade-text grade-${l.rating}`}>{ratingLabels[l.rating]}</span>
                  <small className="muted">
                    {l.review.toLocaleString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </div>
              ))
          ) : (
            <p className="muted">История появится после первого повторения.</p>
          )}
        </section>
      </div>
    </>
  )
}
