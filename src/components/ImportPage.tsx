import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ClipboardPaste, Copy, Download, FileJson, Pencil, Upload, X } from 'lucide-react'
import { db } from '../db'
import { type Snapshot, typeLabels } from '../model'
import { cardImporter, duplicateHints } from '../import/service'
import { MAX_IMPORT_BYTES } from '../import/validation'
import { exchangeExample } from '../import/example'
import { exchangeJsonSchema } from '../import/schema'
import { downloadJson, generationPrompt } from '../import/prompt'
import type { CardDraft } from '../import/model'
import { DraftEditor, DraftPreview } from './DraftEditor'
import { Modal } from './Modal'
const statusLabels = {
  pending: 'Ожидает проверки',
  accepted: 'Принята',
  rejected: 'Отклонена',
  duplicate: 'Объединена с существующей',
}
export function ImportPage({ data }: { data: Snapshot }) {
  const drafts = useLiveQuery(() => db.cardDrafts.orderBy('createdAt').toArray(), []) ?? []
  const batches =
    useLiveQuery(() => db.importBatches.orderBy('createdAt').reverse().toArray(), []) ?? []
  const [text, setText] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [showPrompt, setShowPrompt] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [status, setStatus] = useState<'pending' | 'all' | 'rejected'>('pending'),
    [batchId, setBatch] = useState(''),
    [previewId, setPreview] = useState<string>(),
    [editing, setEditing] = useState<CardDraft>()
  const inputRef = useRef<HTMLTextAreaElement>(null),
    lock = useRef(false)
  const visible = drafts.filter(
      (d) => (status === 'all' || d.status === status) && (!batchId || d.batchId === batchId),
    ),
    pending = visible.filter((d) => d.status === 'pending')
  const selectedIds = pending.filter((d) => selected.has(d.id)).map((d) => d.id),
    duplicates = duplicateHints(drafts, data),
    preview = drafts.find((d) => d.id === previewId)
  async function action(task: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await task()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие')
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  async function stage(value: string, label: string) {
    const result = await cardImporter.stage(value, label)
    setText('')
    setStatus('pending')
    setBatch(result.batchId)
    setSelected(new Set())
    setNotice(`В черновики добавлено карточек: ${result.count}. В обучение они пока не включены.`)
  }
  async function accept(ids: string[]) {
    await action(async () => {
      const result = await cardImporter.accept(ids)
      setSelected(new Set())
      setPreview(undefined)
      setNotice(
        `Создано карточек: ${result.created}. Совпадений объединено: ${result.reused}. Существующая история повторений сохранена.`,
      )
    })
  }
  async function reject(ids: string[]) {
    await action(async () => {
      await cardImporter.reject(ids)
      setSelected(new Set())
      setPreview(undefined)
      setNotice(`Отклонено черновиков: ${ids.length}. Их можно вернуть через фильтр «Отклонённые».`)
    })
  }
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(generationPrompt())
      setNotice('Промпт скопирован. Вставьте его в ChatGPT, затем отправьте свой материал.')
    } catch {
      setShowPrompt(true)
    }
  }
  return (
    <div className="import-page">
      <section className="panel">
        <div className="section-heading">
          <h2>
            <FileJson size={18} />
            Карточки из JSON
          </h2>
          <span className="badge">Формат v1</span>
        </div>
        <p className="muted">
          Загрузите ответ внешнего ИИ или вставьте JSON. Сначала проверьте черновики — импорт не
          меняет библиотеку и расписание.
        </p>
        <div className="import-actions">
          <button className="button" disabled={busy} onClick={() => void copyPrompt()}>
            <Copy size={15} />
            Скопировать промпт для ChatGPT
          </button>
          <button className="button subtle" onClick={() => setShowPrompt(true)}>
            Открыть промпт
          </button>
          <button
            className="button"
            onClick={() =>
              downloadJson(exchangeExample, 'mathrecall-card-exchange.v1.example.json')
            }
          >
            <Download size={15} />
            Пример JSON
          </button>
          <button
            className="button"
            onClick={() =>
              downloadJson(exchangeJsonSchema, 'mathrecall-card-exchange.v1.schema.json')
            }
          >
            <Download size={15} />
            JSON Schema
          </button>
        </div>
        <div className="import-actions">
          <label className={`button file-button ${busy ? 'disabled' : ''}`}>
            <Upload size={15} />
            Загрузить JSON-файл
            <input
              aria-label="JSON-файл с карточками"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file)
                  void action(async () => {
                    if (file.size > MAX_IMPORT_BYTES)
                      throw Error('Файл слишком большой. Максимум 2 МБ.')
                    await stage(await file.text(), file.name)
                  })
              }}
            />
          </label>
          <button
            className="button subtle"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                try {
                  const value = await navigator.clipboard.readText()
                  if (!value.trim()) {
                    inputRef.current?.focus()
                    setNotice('Буфер обмена пуст. Вставьте JSON вручную в поле ниже.')
                    return
                  }
                  setText(value)
                  setNotice('JSON вставлен. Нажмите «Проверить и добавить в черновики».')
                } catch {
                  inputRef.current?.focus()
                  setNotice(
                    'Доступ к буферу недоступен. Вставьте JSON в поле ниже сочетанием ⌘V / Ctrl+V.',
                  )
                }
              })
            }
          >
            <ClipboardPaste size={15} />
            Вставить из буфера
          </button>
        </div>
        <label>
          JSON карточек
          <textarea
            ref={inputRef}
            rows={8}
            className="json-input"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              '{\n  "format": "MathRecall.CardExchange",\n  "version": 1,\n  "cards": […]\n}'
            }
          />
        </label>
        <div className="import-actions">
          <button
            className="button primary"
            disabled={busy || !text.trim()}
            onClick={() => void action(() => stage(text, 'Вставка JSON'))}
          >
            Проверить и добавить в черновики
          </button>
          <span className="muted small">
            До 500 карточек / 2 МБ. Полная резервная копия восстанавливается в настройках.
          </span>
        </div>
      </section>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      <section className="panel draft-queue">
        <div className="section-heading">
          <h2>
            Очередь черновиков{' '}
            <span className="count">{drafts.filter((d) => d.status === 'pending').length}</span>
          </h2>
        </div>
        <div className="form-grid">
          <label>
            Статус черновиков
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as typeof status)
                setSelected(new Set())
              }}
            >
              <option value="pending">На проверке</option>
              <option value="rejected">Отклонённые</option>
              <option value="all">Все, включая обработанные</option>
            </select>
          </label>
          <label>
            Пакет импорта
            <select
              value={batchId}
              onChange={(e) => {
                setBatch(e.target.value)
                setSelected(new Set())
              }}
            >
              <option value="">Все импорты</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.label} · {batch.createdAt.toLocaleString('ru-RU')} · {batch.cardCount}{' '}
                  карточек
                </option>
              ))}
            </select>
          </label>
        </div>
        {pending.length > 0 && (
          <div className="draft-toolbar">
            <label className="inline-check">
              <input
                type="checkbox"
                aria-label="Выбрать все черновики"
                checked={pending.every((d) => selected.has(d.id))}
                disabled={busy}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(pending.map((d) => d.id)) : new Set())
                }
              />
              Выбрано: {selectedIds.length}
            </label>
            <button
              className="button"
              disabled={busy || !selectedIds.length}
              onClick={() => void accept(selectedIds)}
            >
              <Check size={15} />
              Принять выбранные ({selectedIds.length})
            </button>
            <button
              className="button danger"
              disabled={busy || !selectedIds.length}
              onClick={() => void reject(selectedIds)}
            >
              <X size={15} />
              Отклонить выбранные
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void accept(pending.map((d) => d.id))}
            >
              Принять все ({pending.length})
            </button>
          </div>
        )}
        {!visible.length ? (
          <div className="empty">
            <FileJson size={27} />
            <h3>
              {status === 'pending'
                ? 'Нет черновиков на проверке'
                : 'Нет черновиков в этом фильтре'}
            </h3>
            <p>Загрузите файл или вставьте JSON. Черновики сохраняются после перезагрузки.</p>
          </div>
        ) : (
          <div className="draft-list">
            {visible.map((draft) => (
              <article key={draft.id} className="draft-row">
                {draft.status === 'pending' && (
                  <input
                    type="checkbox"
                    aria-label={`Выбрать черновик: ${draft.payload.question}`}
                    checked={selected.has(draft.id)}
                    disabled={busy}
                    onChange={(e) =>
                      setSelected((ids) => {
                        const next = new Set(ids)
                        if (e.target.checked) next.add(draft.id)
                        else next.delete(draft.id)
                        return next
                      })
                    }
                  />
                )}
                <div className="draft-summary">
                  <div className="draft-row-title">
                    <span className={`badge ${draft.payload.type}`}>
                      {typeLabels[draft.payload.type]}
                    </span>
                    <span className="muted small">{statusLabels[draft.status]}</span>
                  </div>
                  <button
                    className="draft-question text-button"
                    onClick={() => setPreview(draft.id)}
                  >
                    {draft.payload.question}
                  </button>
                  <p className="muted small">
                    {draft.payload.subject} / {draft.payload.topicPath.join(' / ') || 'Без темы'}
                    {draft.payload.tickets.length
                      ? ` · Билетов: ${draft.payload.tickets.length}`
                      : ''}
                  </p>
                  {draft.status === 'pending' && duplicates.has(draft.id) && (
                    <p className="duplicate-note">{duplicates.get(draft.id)}</p>
                  )}
                </div>
                <div className="draft-row-actions">
                  <button className="button" onClick={() => setPreview(draft.id)}>
                    Просмотр
                  </button>
                  {draft.status === 'pending' ? (
                    <>
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Редактировать черновик: ${draft.payload.question}`}
                        onClick={() => setEditing(draft)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => void accept([draft.id])}
                      >
                        Принять
                      </button>
                      <button
                        className="icon-button danger"
                        disabled={busy}
                        aria-label={`Отклонить черновик: ${draft.payload.question}`}
                        onClick={() => void reject([draft.id])}
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    draft.status === 'rejected' && (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await cardImporter.reopen(draft.id)
                            setNotice('Черновик возвращён на проверку.')
                          })
                        }
                      >
                        Вернуть на проверку
                      </button>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {preview && (
        <DraftPreview
          draft={preview}
          duplicate={duplicates.get(preview.id)}
          busy={busy}
          onClose={() => setPreview(undefined)}
          onEdit={() => {
            setEditing(preview)
            setPreview(undefined)
          }}
          onAccept={() => void accept([preview.id])}
          onReject={() => void reject([preview.id])}
        />
      )}
      {editing && <DraftEditor draft={editing} onClose={() => setEditing(undefined)} />}
      {showPrompt && (
        <Modal title="Промпт для ChatGPT" wide onClose={() => setShowPrompt(false)}>
          <div className="detail-content form-stack">
            <p className="muted small">
              Выделите инструкцию и скопируйте её сочетанием ⌘C / Ctrl+C.
            </p>
            <textarea
              aria-label="Промпт для ChatGPT"
              readOnly
              rows={18}
              value={generationPrompt()}
              onFocus={(e) => e.target.select()}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
