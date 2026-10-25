import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { timestamps, type Snapshot, type Subject, type Topic, type Ticket } from '../model'
import { repository, topicDescendants } from '../services/repository'
export type EntityEdit =
  | { kind: 'subject'; value?: Subject }
  | { kind: 'topic'; value?: Topic; subjectId?: string; parentId?: string }
  | { kind: 'ticket'; value?: Ticket; topicId?: string }
export function EntityEditor({
  edit,
  data,
  onClose,
}: {
  edit: EntityEdit
  data: Snapshot
  onClose: () => void
}) {
  const [name, setName] = useState(edit.value?.name ?? '')
  const [description, setDescription] = useState(
    edit.kind === 'ticket' ? (edit.value?.description ?? '') : '',
  )
  const [subjectId, setSubject] = useState(
    edit.kind === 'topic'
      ? (edit.value?.subjectId ?? edit.subjectId ?? data.subjects[0]?.id ?? '')
      : '',
  )
  const [parentId, setParent] = useState(
    edit.kind === 'topic' ? (edit.value?.parentId ?? edit.parentId ?? '') : '',
  )
  const [topicId, setTopic] = useState(
    edit.kind === 'ticket' ? (edit.value?.topicId ?? edit.topicId ?? data.topics[0]?.id ?? '') : '',
  )
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const forbidden =
    edit.kind === 'topic' && edit.value
      ? topicDescendants(data.topics, edit.value.id)
      : new Set<string>()
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const base = { ...(edit.value ?? timestamps()), name: name.trim(), updatedAt: new Date() }
    try {
      if (edit.kind === 'subject') await repository.saveSubject(base)
      if (edit.kind === 'topic')
        await repository.saveTopic({ ...base, subjectId, parentId: parentId || null })
      if (edit.kind === 'ticket') await repository.saveTicket({ ...base, description, topicId })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`${edit.value ? 'Редактировать' : 'Создать'} ${edit.kind === 'subject' ? 'предмет' : edit.kind === 'topic' ? 'тему' : 'билет'}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          Название
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {edit.kind === 'topic' && (
          <>
            <label>
              Предмет
              <select
                required
                value={subjectId}
                disabled={!!edit.value}
                onChange={(e) => {
                  setSubject(e.target.value)
                  setParent('')
                }}
              >
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Родительская тема
              <select value={parentId} onChange={(e) => setParent(e.target.value)}>
                <option value="">Без родительской темы</option>
                {data.topics
                  .filter((t) => t.subjectId === subjectId && !forbidden.has(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {edit.kind === 'ticket' && (
          <>
            <label>
              Тема
              <select required value={topicId} onChange={(e) => setTopic(e.target.value)}>
                <option value="" disabled>
                  Выберите тему
                </option>
                {data.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {data.subjects.find((s) => s.id === t.subjectId)?.name} / {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Описание
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Отмена
          </button>
          <button className="button primary" disabled={busy}>
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  )
}
