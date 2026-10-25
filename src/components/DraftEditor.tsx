import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from './Modal'
import { MathText } from './MathText'
import { SourceReferences } from './SourceReferences'
import { typeLabels } from '../model'
import type { CardDraft } from '../import/model'
import { cardImporter } from '../import/service'
import type { ExchangeCard } from '../import/schema'
export function DraftEditor({ draft, onClose }: { draft: CardDraft; onClose: () => void }) {
  const [value, setValue] = useState<ExchangeCard>(draft.payload),
    [path, setPath] = useState(draft.payload.topicPath.join('\n')),
    [hints, setHints] = useState(draft.payload.hints.join('\n\n'))
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const dirty =
    JSON.stringify(value) !== JSON.stringify(draft.payload) ||
    path !== draft.payload.topicPath.join('\n') ||
    hints !== draft.payload.hints.join('\n\n')
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  function close() {
    if (!dirty || confirm('Закрыть редактор и потерять несохранённые изменения?')) onClose()
  }
  function field<K extends keyof ExchangeCard>(key: K, next: ExchangeCard[K]) {
    setValue((v) => ({ ...v, [key]: next }))
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await cardImporter.edit(
        draft.id,
        {
          ...value,
          topicPath: path
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          hints: hints
            .split(/\n\s*\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
        draft.revision,
      )
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить черновик')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Редактировать черновик" onClose={close} wide>
      <form className="form-stack" onSubmit={save}>
        <div className="form-grid">
          <label>
            Предмет
            <input
              required
              maxLength={200}
              value={value.subject}
              onChange={(e) => field('subject', e.target.value)}
            />
          </label>
          <label>
            Тип карточки
            <select
              value={value.type}
              onChange={(e) => field('type', e.target.value as ExchangeCard['type'])}
            >
              {Object.entries(typeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Путь темы — по одному уровню на строку
          <textarea rows={2} value={path} onChange={(e) => setPath(e.target.value)} />
        </label>
        <div className="editor-grid">
          <section className="form-stack">
            <label>
              Вопрос
              <textarea
                required
                rows={4}
                maxLength={20000}
                value={value.question}
                onChange={(e) => field('question', e.target.value)}
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
              />
            </label>
            <label>
              Подсказки — разделяйте пустой строкой
              <textarea rows={3} value={hints} onChange={(e) => setHints(e.target.value)} />
            </label>
          </section>
          <section className="preview-panel">
            <div className="section-eyebrow">ПРЕДПРОСМОТР</div>
            <h3>Вопрос</h3>
            <MathText>{value.question}</MathText>
            <div className="divider" />
            <h3>Ответ</h3>
            <MathText>{value.answer}</MathText>
            {hints && (
              <>
                <h3>Подсказки</h3>
                <MathText>{hints}</MathText>
              </>
            )}
          </section>
        </div>
        <fieldset className="form-stack">
          <legend>Билеты последней темы</legend>
          {value.tickets.map((ticket, index) => (
            <div key={index} className="import-metadata-row">
              <label>
                Название билета
                <input
                  required
                  maxLength={200}
                  value={ticket.name}
                  onChange={(e) =>
                    field(
                      'tickets',
                      value.tickets.map((t, i) =>
                        i === index ? { ...t, name: e.target.value } : t,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Описание
                <input
                  maxLength={20000}
                  value={ticket.description}
                  onChange={(e) =>
                    field(
                      'tickets',
                      value.tickets.map((t, i) =>
                        i === index ? { ...t, description: e.target.value } : t,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="icon-button danger"
                type="button"
                aria-label={`Удалить билет ${index + 1} из черновика`}
                onClick={() =>
                  field(
                    'tickets',
                    value.tickets.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            className="button"
            type="button"
            disabled={value.tickets.length >= 30}
            onClick={() => field('tickets', [...value.tickets, { name: '', description: '' }])}
          >
            <Plus size={15} />
            Добавить билет
          </button>
        </fieldset>
        <fieldset className="form-stack">
          <legend>Источники</legend>
          {value.sources.map((source, index) => (
            <div className="source-edit" key={index}>
              <div className="import-metadata-row">
                <label>
                  Название источника
                  <input
                    required
                    maxLength={200}
                    value={source.title}
                    onChange={(e) =>
                      field(
                        'sources',
                        value.sources.map((s, i) =>
                          i === index ? { ...s, title: e.target.value } : s,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Ссылка http/https
                  <input
                    type="url"
                    value={source.url ?? ''}
                    onChange={(e) =>
                      field(
                        'sources',
                        value.sources.map((s, i) =>
                          i === index ? { ...s, url: e.target.value || null } : s,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Удалить источник ${index + 1}`}
                  onClick={() =>
                    field(
                      'sources',
                      value.sources.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="form-grid">
                {(['pageStart', 'pageEnd'] as const).map((key) => (
                  <label key={key}>
                    {key === 'pageStart' ? 'Начальная страница' : 'Конечная страница'}
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      value={source[key] ?? ''}
                      onChange={(e) =>
                        field(
                          'sources',
                          value.sources.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  [key]: e.target.value === '' ? null : Number(e.target.value),
                                }
                              : s,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button
            className="button"
            type="button"
            disabled={value.sources.length >= 10}
            onClick={() =>
              field('sources', [
                ...value.sources,
                { title: '', url: null, pageStart: null, pageEnd: null },
              ])
            }
          >
            <Plus size={15} />
            Добавить источник
          </button>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="small muted">
          Сохранение меняет только черновик. В обучение карточка попадёт после принятия.
        </p>
        <div className="modal-actions">
          <button className="button" type="button" onClick={close}>
            Отмена
          </button>
          <button className="button primary" disabled={busy}>
            Сохранить черновик
          </button>
        </div>
      </form>
    </Modal>
  )
}
export function DraftPreview({
  draft,
  duplicate,
  onClose,
  onEdit,
  onAccept,
  onReject,
  busy,
}: {
  draft: CardDraft
  duplicate?: string
  onClose: () => void
  onEdit: () => void
  onAccept: () => void
  onReject: () => void
  busy: boolean
}) {
  const card = draft.payload
  return (
    <Modal title="Предпросмотр черновика" onClose={onClose} wide>
      <div className="detail-content">
        <span className={`badge ${card.type}`}>{typeLabels[card.type]}</span>
        <p className="muted small">
          {card.subject} / {card.topicPath.join(' / ') || 'Без темы'}
        </p>
        {duplicate && <p className="duplicate-note">{duplicate}</p>}
        <h2>
          <MathText>{card.question}</MathText>
        </h2>
        <div className="answer">
          <MathText>{card.answer}</MathText>
        </div>
        {card.hints.map((hint, index) => (
          <div className="hint" key={index}>
            <span>{index + 1}.</span>
            <MathText>{hint}</MathText>
          </div>
        ))}
        {card.tickets.length > 0 && (
          <section className="source-references">
            <h3>Билеты</h3>
            {card.tickets.map((ticket, i) => (
              <p key={i}>
                {ticket.name}
                {ticket.description ? ` — ${ticket.description}` : ''}
              </p>
            ))}
          </section>
        )}
        <SourceReferences sources={card.sources} />
        <div className="modal-actions">
          {draft.status === 'pending' ? (
            <>
              <button className="button danger" disabled={busy} onClick={onReject}>
                Отклонить
              </button>
              <button className="button" onClick={onEdit} disabled={busy}>
                Редактировать
              </button>
              <button className="button primary" disabled={busy} onClick={onAccept}>
                Принять карточку
              </button>
            </>
          ) : (
            <button className="button" onClick={onClose}>
              Закрыть просмотр
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
