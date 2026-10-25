import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  GraduationCap,
  Layers,
  Menu,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { db } from './db'
import { repository, scopedCards, reviewQueue, type Scope } from './services/repository'
import { endOfDay, startOfDay } from './services/scheduler'
import {
  defaultSettings,
  typeLabels,
  stateLabels,
  type Snapshot,
  type StudyCard,
  type Topic,
} from './model'
import { CardEditor } from './components/CardEditor'
import { EntityEditor, type EntityEdit } from './components/EntityEditor'
import { Modal } from './components/Modal'
import { MathText } from './components/MathText'
import { Review } from './components/Review'
import { Statistics } from './components/Statistics'
import { SettingsView } from './components/SettingsView'
import { Sidebar } from './components/Sidebar'
import { CardList } from './components/CardList'
import { DailySummary } from './components/DailySummary'
import { pages, type Page } from './ui'

function App() {
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [page, setPage] = useState<Page>('today'),
    [scope, setScope] = useState<Scope>({}),
    [query, setQuery] = useState(''),
    [type, setType] = useState(''),
    [mobile, setMobile] = useState(false)
  const [entity, setEntity] = useState<EntityEdit>(),
    [editor, setEditor] = useState<{ card?: StudyCard }>(),
    [detail, setDetail] = useState<StudyCard>(),
    [session, setSession] = useState<{ data: Snapshot; ids: string[] }>(),
    [now, setNow] = useState(new Date()),
    [notice, setNotice] = useState('')
  useEffect(() => {
    void repository
      .init()
      .then(() => setReady(true))
      .catch((e) => setError(`Не удалось открыть локальную базу: ${String(e)}`))
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])
  const data = useLiveQuery(() => db.snapshot(), [])
  useEffect(() => {
    if (data) setNow(new Date())
  }, [data])
  useEffect(() => {
    document.documentElement.dataset.theme = data?.settings[0]?.theme ?? 'dark'
  }, [data?.settings])
  async function run(task: () => Promise<unknown>, success?: string) {
    setError('')
    try {
      await task()
      if (success) setNotice(success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие')
    }
  }
  function navigate(p: Page, next: Scope = {}) {
    setPage(p)
    setScope(next)
    setQuery('')
    setMobile(false)
  }
  if (!ready || !data)
    return (
      <div className="loading">
        <span className="logo-mark">
          m<span>r</span>
        </span>
        <p>{error || 'Открываем ваше пространство…'}</p>
      </div>
    )
  const settings = data.settings[0] ?? defaultSettings,
    states = new Map(data.states.map((s) => [s.cardId, s]))
  const selectedCards = scopedCards(data, scope),
    queue = reviewQueue(data, scope, now),
    todayCards = data.cards.filter((c) => {
      const s = states.get(c.id)
      return s && s.due <= endOfDay(now)
    })
  const doneToday = data.logs.filter((l) => l.review >= startOfDay(now)).length
  const subject = data.subjects.find((s) => s.id === scope.subjectId),
    topic = data.topics.find((t) => t.id === scope.topicId),
    ticket = data.tickets.find((t) => t.id === scope.ticketId)
  const list = (page === 'today' ? todayCards : selectedCards).filter(
    (c) =>
      (!type || c.type === type) &&
      (!query ||
        [
          c.question,
          c.answer,
          c.source,
          ...c.hints,
          data.subjects.find((s) => s.id === c.subjectId)?.name ?? '',
          data.topics.find((t) => t.id === c.topicId)?.name ?? '',
          ...data.links
            .filter((l) => l.cardId === c.id)
            .map((l) => data.tickets.find((t) => t.id === l.ticketId)?.name ?? ''),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())),
  )
  const chooseTopic = (t: Topic) => navigate('library', { subjectId: t.subjectId, topicId: t.id })
  function startReview() {
    const ids = reviewQueue(data!, scope, new Date()).map((c) => c.id)
    if (!ids.length) {
      setNotice(
        'Сейчас нет доступных повторений. Проверьте время следующего повторения и дневной лимит.',
      )
      return
    }
    setSession({ data: data!, ids })
  }
  async function remove(kind: 'subject' | 'topic' | 'ticket' | 'card', id: string) {
    if (
      !confirm(
        kind === 'ticket'
          ? 'Удалить билет? Карточки и их прогресс сохранятся.'
          : 'Удалить выбранный элемент и все вложенные данные, карточки и их историю?',
      )
    )
      return
    await run(() => repository.remove(kind, id), 'Удалено')
    setDetail(undefined)
    if (kind !== 'card') setScope({})
  }
  const editScope = scope.ticketId ? { ...scope, topicId: ticket?.topicId } : scope
  function empty(title: string, body: string) {
    return (
      <div className="empty">
        <Layers size={28} />
        <h3>{title}</h3>
        <p>{body}</p>
        <button className="button" onClick={() => setEditor({})}>
          <Plus size={16} /> Создать карточку
        </button>
      </div>
    )
  }
  if (session)
    return (
      <Review
        data={session.data}
        ids={session.ids}
        onClose={() => {
          setSession(undefined)
          setNow(new Date())
          navigate('today')
        }}
      />
    )
  return (
    <div className="app-shell">
      <Sidebar
        data={data}
        scope={scope}
        page={page}
        mobile={mobile}
        todayCount={todayCards.length}
        theme={settings.theme}
        onNavigate={navigate}
        onEntity={setEntity}
        onTheme={() =>
          void run(() =>
            repository.saveSettings({
              ...settings,
              theme: settings.theme === 'dark' ? 'light' : 'dark',
            }),
          )
        }
      />
      {mobile && (
        <button
          className="mobile-overlay"
          aria-label="Закрыть меню"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span className="muted">Моё пространство</span>
            <ChevronRight size={13} />
            <span>{pages[page]}</span>
          </div>
          <div className="topbar-right">
            <span className="small muted">
              {now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
            </span>
            <span className="avatar">М</span>
          </div>
        </header>
        <main className="main-content">
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button
                aria-label="Закрыть ошибку"
                className="icon-button"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
              <button
                aria-label="Закрыть уведомление"
                className="icon-button"
                onClick={() => setNotice('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="section-eyebrow">
                {page === 'today'
                  ? 'ПОНЕМНОГУ. КАЖДЫЙ ДЕНЬ.'
                  : page === 'library'
                    ? 'ВАШИ ЗНАНИЯ, ПО ПОЛОЧКАМ'
                    : page === 'stats'
                      ? 'КАК РАСТУТ ВАШИ ЗНАНИЯ'
                      : 'ВАШЕ ПРОСТРАНСТВО'}
              </div>
              <h1>
                {page === 'today'
                  ? 'Время вспомнить.'
                  : page === 'library'
                    ? (ticket?.name ?? topic?.name ?? subject?.name ?? 'Библиотека')
                    : pages[page]}
              </h1>
              <p className="muted">
                {page === 'today'
                  ? 'Маленькие повторения сегодня — прочные знания завтра.'
                  : page === 'library'
                    ? ticket?.description || 'Предметы, темы и карточки — всё связано между собой.'
                    : page === 'stats'
                      ? 'Реальные повторения и предстоящая нагрузка.'
                      : 'Настройте обучение и сохраните резервную копию.'}
              </p>
            </div>
            {(page === 'today' || page === 'library') && (
              <button className="button" onClick={() => setEditor({})}>
                <Plus size={16} /> Новая карточка
              </button>
            )}
          </div>
          {page === 'today' && (
            <DailySummary
              todayCount={todayCards.length}
              availableCount={queue.length}
              cardCount={data.cards.length}
              newCount={data.states.filter((s) => s.state === 0).length}
              doneToday={doneToday}
              onReview={startReview}
              onCreate={() => setEditor({})}
            />
          )}
          {(page === 'today' || page === 'library') && (
            <>
              {page === 'library' && (
                <>
                  <div className="library-toolbar">
                    <button className="button" onClick={() => setEntity({ kind: 'subject' })}>
                      <Plus size={15} /> Предмет
                    </button>
                    <button
                      className="button"
                      disabled={!data.subjects.length}
                      onClick={() =>
                        setEntity({
                          kind: 'topic',
                          subjectId: scope.subjectId,
                          parentId: scope.topicId,
                        })
                      }
                    >
                      <Plus size={15} /> Тема
                    </button>
                    <button
                      className="button"
                      disabled={!data.topics.length}
                      onClick={() => setEntity({ kind: 'ticket', topicId: scope.topicId })}
                    >
                      <Plus size={15} /> Билет
                    </button>
                    <div className="toolbar-spacer" />
                    {(ticket || topic || subject) && (
                      <>
                        <button
                          className="icon-button"
                          aria-label="Редактировать выбранный элемент"
                          onClick={() =>
                            setEntity(
                              ticket
                                ? { kind: 'ticket', value: ticket }
                                : topic
                                  ? { kind: 'topic', value: topic }
                                  : { kind: 'subject', value: subject! },
                            )
                          }
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          className="icon-button danger"
                          aria-label="Удалить выбранный элемент"
                          onClick={() =>
                            void remove(
                              ticket ? 'ticket' : topic ? 'topic' : 'subject',
                              (ticket ?? topic ?? subject)!.id,
                            )
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </>
                    )}
                    <button
                      className="button primary"
                      disabled={!queue.length}
                      onClick={startReview}
                    >
                      Повторить ({queue.length})<ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="scope-filters">
                    <label>
                      Предмет
                      <select
                        aria-label="Фильтр предмета"
                        value={scope.subjectId ?? ''}
                        onChange={(e) =>
                          setScope(e.target.value ? { subjectId: e.target.value } : {})
                        }
                      >
                        <option value="">Все предметы</option>
                        {data.subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Тема
                      <select
                        aria-label="Фильтр темы"
                        value={scope.topicId ?? ''}
                        onChange={(e) =>
                          setScope({
                            ...scope,
                            topicId: e.target.value || undefined,
                            ticketId: undefined,
                          })
                        }
                      >
                        <option value="">Все темы</option>
                        {data.topics
                          .filter((t) => !scope.subjectId || t.subjectId === scope.subjectId)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Билет
                      <select
                        aria-label="Фильтр билета"
                        value={scope.ticketId ?? ''}
                        onChange={(e) => {
                          const t = data.tickets.find((t) => t.id === e.target.value)
                          const top = data.topics.find((top) => top.id === t?.topicId)
                          setScope(
                            t
                              ? { subjectId: top?.subjectId, topicId: t.topicId, ticketId: t.id }
                              : { ...scope, ticketId: undefined },
                          )
                        }}
                      >
                        <option value="">Все билеты</option>
                        {data.tickets
                          .filter((t) =>
                            scope.topicId
                              ? t.topicId === scope.topicId
                              : !scope.subjectId ||
                                data.topics.find((top) => top.id === t.topicId)?.subjectId ===
                                  scope.subjectId,
                          )
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  {!ticket && (
                    <div className="collections">
                      {data.topics
                        .filter((t) =>
                          scope.topicId
                            ? t.parentId === scope.topicId
                            : scope.subjectId
                              ? t.subjectId === scope.subjectId && !t.parentId
                              : false,
                        )
                        .map((t) => (
                          <div className="collection" key={t.id}>
                            <button className="collection-main" onClick={() => chooseTopic(t)}>
                              <Layers size={18} />
                              <span>{t.name}</span>
                              <ChevronRight size={16} />
                            </button>
                            <button
                              className="icon-button tiny"
                              aria-label={`Редактировать тему ${t.name}`}
                              onClick={() => setEntity({ kind: 'topic', value: t })}
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        ))}
                      {data.tickets
                        .filter((t) =>
                          scope.topicId
                            ? t.topicId === scope.topicId
                            : scope.subjectId
                              ? data.topics.find((top) => top.id === t.topicId)?.subjectId ===
                                scope.subjectId
                              : true,
                        )
                        .map((t) => (
                          <div className="collection" key={t.id}>
                            <button
                              className="collection-main"
                              onClick={() => {
                                const top = data.topics.find((top) => top.id === t.topicId)
                                navigate('library', {
                                  subjectId: top?.subjectId,
                                  topicId: t.topicId,
                                  ticketId: t.id,
                                })
                              }}
                            >
                              <GraduationCap size={18} />
                              <span>
                                {t.name}
                                <small>
                                  {data.links.filter((l) => l.ticketId === t.id).length} карточек
                                </small>
                              </span>
                              <ChevronRight size={16} />
                            </button>
                            <button
                              className="icon-button tiny"
                              aria-label={`Редактировать билет ${t.name}`}
                              onClick={() => setEntity({ kind: 'ticket', value: t })}
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
              <section className="list-section">
                <div className="section-heading">
                  <h2>
                    {page === 'today' ? 'План на сегодня' : 'Карточки'}{' '}
                    <span className="count">{list.length}</span>
                  </h2>
                  {page === 'today' && (
                    <button className="text-button muted" onClick={() => navigate('library')}>
                      Вся библиотека <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                <div className="list-controls">
                  <div className="tabs">
                    {[
                      ['', 'Все'],
                      ['definition', 'Определения'],
                      ['proof', 'Доказательства'],
                      ['problem', 'Задачи'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={type === key ? 'active' : ''}
                        onClick={() => setType(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      aria-label="Поиск карточек"
                      placeholder="Найти карточку…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                {list.length ? (
                  <CardList cards={list} data={data} now={now} onSelect={setDetail} />
                ) : query || type ? (
                  <div className="empty">
                    <Search size={26} />
                    <h3>Ничего не найдено</h3>
                    <p>Попробуйте другой запрос или тип карточки.</p>
                  </div>
                ) : (
                  empty(
                    page === 'today' ? 'На сегодня всё спокойно' : 'Здесь начнётся ваша библиотека',
                    page === 'today'
                      ? 'Создайте карточки или дождитесь следующего повторения.'
                      : 'Добавьте определение, доказательство или задачу.',
                  )
                )}
              </section>
              {page === 'today' && (
                <section className="subjects-section">
                  <div className="section-heading">
                    <h2>Ваши предметы</h2>
                    <button
                      className="text-button muted"
                      onClick={() => setEntity({ kind: 'subject' })}
                    >
                      <Plus size={14} /> Добавить
                    </button>
                  </div>
                  <div className="subject-cards">
                    {data.subjects.map((s, i) => {
                      const cards = data.cards.filter((c) => c.subjectId === s.id),
                        learned = cards.filter((c) => states.get(c.id)?.state === 2).length
                      return (
                        <button
                          className="subject-card"
                          key={s.id}
                          onClick={() => navigate('library', { subjectId: s.id })}
                        >
                          <span className={`subject-square dot-${i % 3}`}>
                            <BookOpen size={19} />
                          </span>
                          <h3>{s.name}</h3>
                          <p className="muted small">
                            {cards.length} карточек ·{' '}
                            {data.topics.filter((t) => t.subjectId === s.id).length} тем
                          </p>
                          <div className="subject-progress">
                            <span
                              style={{
                                width: `${cards.length ? (learned / cards.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="small muted">
                            {learned} в режиме повторения <ChevronRight size={14} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}
          {page === 'stats' && <Statistics data={data} now={now} />}
          {page === 'settings' && (
            <SettingsView
              settings={settings}
              run={run}
              onReset={() => {
                setScope({})
                setDetail(undefined)
              }}
              onNotice={setNotice}
            />
          )}
          <footer className="content-footer">
            <span className="status-dot" /> Учитесь в своём ритме. Всё сохраняется на этом
            устройстве.
          </footer>
        </main>
      </div>
      {entity && <EntityEditor edit={entity} data={data} onClose={() => setEntity(undefined)} />}
      {editor && (
        <CardEditor
          card={editor.card}
          data={data}
          scope={editScope}
          onClose={() => setEditor(undefined)}
        />
      )}
      {detail && (
        <Modal title="Карточка" wide onClose={() => setDetail(undefined)}>
          <div className="detail-content">
            <span className={`badge ${detail.type}`}>{typeLabels[detail.type]}</span>
            <h2>
              <MathText>{detail.question}</MathText>
            </h2>
            <div className="answer">
              <MathText>{detail.answer}</MathText>
            </div>
            {detail.hints.map((h, i) => (
              <div key={i} className="hint">
                <span>{i + 1}.</span>
                <MathText>{h}</MathText>
              </div>
            ))}
            {detail.source && <p className="muted small">Источник: {detail.source}</p>}
            <div className="detail-meta">
              <p>Состояние: {stateLabels[states.get(detail.id)?.state ?? 0]}</p>
              <p>
                Следующее повторение:{' '}
                <strong>{states.get(detail.id)?.due.toLocaleString('ru-RU')}</strong>
              </p>
              <p>
                Повторений: {states.get(detail.id)?.reps ?? 0} · Связанных билетов:{' '}
                {data.links.filter((l) => l.cardId === detail.id).length}
              </p>
            </div>
            <div className="modal-actions">
              <button className="button danger" onClick={() => void remove('card', detail.id)}>
                <Trash2 size={15} />
                Удалить
              </button>
              <button
                className="button"
                onClick={() => {
                  setEditor({ card: detail })
                  setDetail(undefined)
                }}
              >
                <Pencil size={15} />
                Редактировать
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
export default App
