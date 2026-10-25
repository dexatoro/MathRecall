import { ArrowRight, CalendarDays, Sparkles, TrendingUp } from 'lucide-react'
export function DailySummary({
  todayCount,
  availableCount,
  cardCount,
  newCount,
  doneToday,
  onReview,
  onCreate,
}: {
  todayCount: number
  availableCount: number
  cardCount: number
  newCount: number
  doneToday: number
  onReview: () => void
  onCreate: () => void
}) {
  return (
    <>
      <section className="study-hero">
        <div className="hero-content">
          <span className="hero-eyebrow">
            <span className="status-dot" /> ВАША ЕЖЕДНЕВНАЯ ПРАКТИКА
          </span>
          <h2>
            {todayCount
              ? 'Знаниям нужно\nнемного внимания.'
              : cardCount
                ? 'Всё по плану.\nМожно выдохнуть.'
                : 'Хороший день,\nчтобы начать.'}
          </h2>
          <p>
            {availableCount
              ? `Сейчас доступны ${availableCount} карточек. Начните с одного вопроса.`
              : todayCount
                ? 'Ближайшие повторения появятся по расписанию.'
                : cardCount
                  ? 'Новые повторения появятся по расписанию.'
                  : 'Создайте первую карточку и вернитесь к ней вовремя.'}
          </p>
          <button className="button primary" onClick={availableCount ? onReview : onCreate}>
            {availableCount ? 'Начать повторение' : 'Создать карточку'} <ArrowRight size={17} />
          </button>
          <span className="hero-footnote">FSRS · интервалы подстраиваются под ваши ответы</span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <div className="math-tile tile-back">∀ε &gt; 0</div>
          <div className="math-tile tile-front">
            <span>МАТЕМАТИКА В ПАМЯТИ</span>
            <div>
              lim a<sub>n</sub> = a
            </div>
            <small>n → ∞</small>
            <div className="tile-line" />
            <p>Понять. Вспомнить. Сохранить.</p>
          </div>
          <span className="art-spark">✦</span>
        </div>
      </section>
      <div className="metrics">
        <div>
          <span className="metric-label">
            <CalendarDays size={15} /> На сегодня
          </span>
          <strong>
            {todayCount}
            <small> карточек</small>
          </strong>
        </div>
        <div>
          <span className="metric-label">
            <Sparkles size={15} /> Новые
          </span>
          <strong>
            {newCount}
            <small> в библиотеке</small>
          </strong>
        </div>
        <div>
          <span className="metric-label">
            <TrendingUp size={15} /> Повторено сегодня
          </span>
          <strong>
            {doneToday}
            <small> повторений</small>
          </strong>
        </div>
      </div>
    </>
  )
}
