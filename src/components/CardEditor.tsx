import { useEffect, useState, type FormEvent } from 'react'
import { Eye, PenLine } from 'lucide-react'
import { Modal } from './Modal'
import { MathText } from './MathText'
import { timestamps, typeLabels, type StudyCard, type Snapshot } from '../model'
import { repository, type Scope } from '../services/repository'
export function CardEditor({
  card,
  data,
  scope,
  onClose,
}: {
  card?: StudyCard
  data: Snapshot
  scope: Scope
  onClose: () => void
}) {
  const [initial] = useState(
    () =>
      card ?? {
        ...timestamps(),
        subjectId:
          scope.subjectId ??
          data.topics.find((t) => t.id === scope.topicId)?.subjectId ??
          data.subjects[0]?.id ??
          '',
        topicId: scope.topicId ?? null,
        type: 'definition' as const,
        question: '',
        answer: '',
        hints: [],
        source: '',
      },
  )
  const [value, setValue] = useState(initial)
  const [initialTickets] = useState(() =>
    card
      ? data.links.filter((l) => l.cardId === card.id).map((l) => l.ticketId)
      : scope.ticketId
        ? [scope.ticketId]
        : [],
  )
  const [ticketIds, setTickets] = useState(initialTickets),
    [hintText, setHints] = useState(initial.hints.join('\n\n'))
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const dirty =
    JSON.stringify(value) !== JSON.stringify(initial) ||
    hintText !== initial.hints.join('\n\n') ||
    JSON.stringify(ticketIds) !== JSON.stringify(initialTickets)
  useEffect(() => {
    function unload(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', unload)
    return () => window.removeEventListener('beforeunload', unload)
  }, [dirty])
  function close() {
    if (!dirty || confirm('Закрыть редактор и потерять несохранённые изменения?')) onClose()
  }
  function field<K extends keyof StudyCard>(key: K, next: StudyCard[K]) {
    setValue((v) => ({ ...v, [key]: next }))
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await repository.saveCard(
        {
          ...value,
          hints: hintText
            .split(/\n\s*\n/)
            .map((s) => s.trim())
            .filter(Boolean),
          updatedAt: new Date(),
        },
        ticketIds,
      )
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={card ? 'Редактировать карточку' : 'Новая карточка'} onClose={close} wide>
      <form onSubmit={save} className="form-stack">
        <div className="form-grid">
          <label>
            Предмет
            <select
              required
              value={value.subjectId}
              onChange={(e) => {
                setValue((v) => ({ ...v, subjectId: e.target.value, topicId: null }))
                setTickets([])
              }}
            >
              <option value="" disabled>
                Выберите предмет
              </option>
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
              value={value.topicId ?? ''}
              onChange={(e) => {
                field('topicId', e.target.value || null)
                setTickets([])
              }}
            >
              <option value="">Без темы</option>
              {data.topics
                .filter((t) => t.subjectId === value.subjectId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label>
          Тип карточки
          <select
            value={value.type}
            onChange={(e) => field('type', e.target.value as StudyCard['type'])}
          >
            {Object.entries(typeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {data.tickets.some((t) => t.topicId === value.topicId) && (
          <fieldset>
            <legend>Связанные билеты</legend>
            <div className="checkbox-list">
              {data.tickets
                .filter((t) => t.topicId === value.topicId)
                .map((t) => (
                  <label key={t.id}>
                    <input
                      type="checkbox"
                      checked={ticketIds.includes(t.id)}
                      onChange={(e) =>
                        setTickets((ids) =>
                          e.target.checked ? [...ids, t.id] : ids.filter((i) => i !== t.id),
                        )
                      }
                    />
                    {t.name}
                  </label>
                ))}
            </div>
          </fieldset>
        )}
        <p className="muted small">
          Markdown и LaTeX: <code>$a_n → a$</code> в строке, <code>$$</code> на отдельных строках
          вокруг блочной формулы. Подсказки разделяйте пустой строкой.
        </p>
        <div className="editor-grid">
          <section className="form-stack">
            <div className="section-eyebrow">
              <PenLine size={14} /> Редактор
            </div>
            <label>
              Вопрос
              <textarea
                autoFocus
                required
                rows={4}
                maxLength={20000}
                value={value.question}
                onChange={(e) => field('question', e.target.value)}
                placeholder="Например: что значит $a_n \\to a$?"
              />
            </label>
            <label>
              Ответ
              <textarea
                required
                rows={6}
                maxLength={20000}
                value={value.answer}
                onChange={(e) => field('answer', e.target.value)}
                placeholder="Определение, доказательство или решение…"
              />
            </label>
            <label>
              Подсказки
              <textarea rows={3} value={hintText} onChange={(e) => setHints(e.target.value)} />
            </label>
            <label>
              Источник
              <input
                maxLength={2000}
                value={value.source}
                onChange={(e) => field('source', e.target.value)}
                placeholder="Учебник, страница или ссылка"
              />
            </label>
          </section>
          <section className="preview-panel">
            <div className="section-eyebrow">
              <Eye size={14} /> Предпросмотр
            </div>
            <span className={`badge ${value.type}`}>{typeLabels[value.type]}</span>
            <h3>Вопрос</h3>
            <MathText>{value.question || 'Текст вопроса появится здесь.'}</MathText>
            <div className="divider" />
            <h3>Ответ</h3>
            <MathText>{value.answer || 'Текст ответа появится здесь.'}</MathText>
            {hintText && (
              <>
                <div className="divider" />
                <h3>Подсказки</h3>
                <MathText>{hintText}</MathText>
              </>
            )}
          </section>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={close}>
            Отмена
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить карточку'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
