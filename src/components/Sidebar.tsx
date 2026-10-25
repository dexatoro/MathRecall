import {
  CalendarDays,
  FileJson,
  ChevronRight,
  Library,
  TrendingUp,
  Settings2,
  Sun,
  Moon,
  Plus,
  Pencil,
} from 'lucide-react'
import type { Snapshot } from '../model'
import type { Scope } from '../services/repository'
import type { EntityEdit } from './EntityEditor'
import { pages, type Page } from '../ui'
export function Sidebar({
  data,
  scope,
  page,
  mobile,
  todayCount,
  theme,
  onNavigate,
  onEntity,
  onTheme,
}: {
  data: Snapshot
  scope: Scope
  page: Page
  mobile: boolean
  todayCount: number
  theme: 'dark' | 'light'
  onNavigate: (page: Page, scope?: Scope) => void
  onEntity: (edit: EntityEdit) => void
  onTheme: () => void
}) {
  function topicTree(
    subjectId: string,
    parentId: string | null = null,
    depth = 0,
  ): React.ReactNode {
    return data!.topics
      .filter((t) => t.subjectId === subjectId && t.parentId === parentId)
      .map((t) => (
        <div key={t.id}>
          <div className="topic-row" style={{ paddingLeft: 12 + depth * 15 }}>
            <button
              className={scope.topicId === t.id ? 'selected text-button' : 'text-button'}
              onClick={() => onNavigate('library', { subjectId: t.subjectId, topicId: t.id })}
            >
              <ChevronRight size={13} />
              {t.name}
            </button>
            <button
              className="icon-button tiny"
              title="Редактировать тему"
              onClick={() => onEntity({ kind: 'topic', value: t })}
            >
              <Pencil size={12} />
            </button>
          </div>
          {topicTree(subjectId, t.id, depth + 1)}
        </div>
      ))
  }
  return (
    <aside className={`sidebar ${mobile ? 'open' : ''}`}>
      <a
        href="#"
        className="wordmark"
        onClick={(e) => {
          e.preventDefault()
          onNavigate('today')
        }}
      >
        <span className="logo-mark">
          m<span>r</span>
        </span>{' '}
        MathRecall
      </a>
      <div className="workspace-label">
        <span className="workspace-avatar">М</span>
        <div>
          Моё пространство<span>Локальная библиотека</span>
        </div>
        <span className="status-dot" />
      </div>
      <nav>
        {(
          [
            { id: 'today', icon: CalendarDays },
            { id: 'library', icon: Library },
            { id: 'import', icon: FileJson },
            { id: 'stats', icon: TrendingUp },
          ] as const
        ).map(({ id, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${page === id ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} />
            {pages[id]}
            {id === 'today' && <span className="nav-count">{todayCount}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-section-title">
        ПРЕДМЕТЫ
        <button
          className="icon-button tiny"
          aria-label="Создать предмет"
          onClick={() => onEntity({ kind: 'subject' })}
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="subject-tree">
        {data.subjects.map((s, i) => (
          <div key={s.id}>
            <button
              className={`subject-item ${scope.subjectId === s.id ? 'selected' : ''}`}
              onClick={() => onNavigate('library', { subjectId: s.id })}
            >
              <span className={`subject-dot dot-${i % 3}`} />
              <span>{s.name}</span>
              <span className="muted small">
                {data.cards.filter((c) => c.subjectId === s.id).length}
              </span>
            </button>
            {scope.subjectId === s.id && topicTree(s.id)}
          </div>
        ))}
      </div>
      <div className="sidebar-bottom">
        <div className="local-note">
          <span className="status-dot" />
          <div>
            Всё хранится на устройстве<span>Вы учитесь. Прогресс остаётся.</span>
          </div>
        </div>
        <button
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <Settings2 size={18} />
          Настройки
        </button>
        <div className="sidebar-footer">
          <span>
            MathRecall <span className="muted">/ MVP 0.2</span>
          </span>
          <button className="icon-button tiny" aria-label="Переключить тему" onClick={onTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </aside>
  )
}
