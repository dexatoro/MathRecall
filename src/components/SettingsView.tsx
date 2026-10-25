import { Download, Upload, Sparkles, Trash2 } from 'lucide-react'
import { OfflineStatus } from './OfflineStatus'
import { db } from '../db'
import { defaultSettings, type Settings } from '../model'
import { repository } from '../services/repository'
import { downloadBackup, importBackup, validateBackup } from '../services/backup'
import { addDemo } from '../services/demo'
export function SettingsView({
  settings,
  run,
  onReset,
  onNotice,
}: {
  settings: Settings
  run: (task: () => Promise<unknown>, success?: string) => Promise<void>
  onReset: () => void
  onNotice: (text: string) => void
}) {
  return (
    <div className="settings-sections">
      <section className="panel">
        <h2>Обучение и оформление</h2>
        <div className="setting-row">
          <div>
            <h3>Цветовая тема</h3>
            <p className="muted small">Выберите комфортный фон.</p>
          </div>
          <select
            aria-label="Цветовая тема"
            value={settings.theme}
            onChange={(e) =>
              void run(() => repository.saveSettings({ ...settings, theme: e.target.value }))
            }
          >
            <option value="dark">Тёмная</option>
            <option value="light">Светлая</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <h3>Новых карточек в день</h3>
            <p className="muted small">Общий лимит для всех предметов. Повторения не ограничены.</p>
          </div>
          <input
            aria-label="Новых карточек в день"
            type="number"
            min={1}
            max={500}
            defaultValue={settings.newLimit}
            key={`limit-${settings.newLimit}`}
            onBlur={(e) =>
              void run(() =>
                repository.saveSettings({ ...settings, newLimit: Number(e.target.value) }),
              )
            }
          />
        </div>
        <div className="setting-row">
          <div>
            <h3>Желаемое запоминание FSRS</h3>
            <p className="muted small">
              Больше процент — чаще повторения. Применяется к следующим оценкам.
            </p>
          </div>
          <select
            aria-label="Желаемое запоминание"
            value={settings.retention}
            onChange={(e) =>
              void run(() =>
                repository.saveSettings({ ...settings, retention: Number(e.target.value) }),
              )
            }
          >
            {[0.7, 0.8, 0.85, 0.9, 0.95, 0.97].map((v) => (
              <option key={v} value={v}>
                {Math.round(v * 100)}%
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="panel">
        <h2>Резервная копия</h2>
        <OfflineStatus />
        <p className="muted">
          Данные хранятся в этом браузере на этом адресе. Скачивайте копию, чтобы перенести
          библиотеку или сохранить прогресс.
        </p>
        <div className="backup-actions">
          <button
            className="button"
            onClick={() => void run(downloadBackup, 'Резервная копия скачана')}
          >
            <Download size={16} /> Экспорт JSON
          </button>
          <label className="button file-button">
            <Upload size={16} /> Восстановить копию JSON
            <input
              aria-label="Восстановить резервную копию JSON"
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file)
                  void run(async () => {
                    if (file.size > 25 * 1024 * 1024)
                      throw Error('Файл слишком большой: максимум 25 МБ')
                    const parsed = validateBackup(JSON.parse(await file.text()))
                    if (
                      confirm(
                        `Заменить всю локальную библиотеку? В копии: ${parsed.cards.length} карточек, ${parsed.logs.length} повторений. Сначала сохраните текущую копию.`,
                      )
                    ) {
                      await importBackup(parsed)
                      onReset()
                      onNotice('Резервная копия восстановлена')
                    }
                  })
              }}
            />
          </label>
        </div>
        <p className="muted small">
          Полная копия библиотеки, не формат обмена карточками. Черновики импорта не входят в копию
          и сохраняются при восстановлении. Повреждённый файл не изменит библиотеку.
        </p>
      </section>
      <section className="panel">
        <h2>Познакомиться с MathRecall</h2>
        <p className="muted">
          Три явно помеченных примера: определение, доказательство и задача. Повторное добавление не
          создаёт дубликаты тем.
        </p>
        <button
          className="button"
          onClick={() => void run(addDemo, 'Демонстрационные примеры добавлены')}
        >
          <Sparkles size={16} /> Добавить демо
        </button>
      </section>
      <section className="panel danger-panel">
        <h2>Удалить локальные данные</h2>
        <p className="muted">
          Удаление библиотеки и истории повторений. Сначала экспортируйте резервную копию.
        </p>
        <button
          className="button danger"
          onClick={() => {
            if (
              confirm(
                'Удалить ВСЮ библиотеку и историю? Это действие нельзя отменить без резервной копии.',
              )
            )
              void run(async () => {
                await db.transaction('rw', db.tables, async () => {
                  for (const t of db.tables) await t.clear()
                  await db.settings.add(defaultSettings)
                })
                onReset()
              }, 'Локальные данные удалены')
          }}
        >
          <Trash2 size={16} /> Удалить всё
        </button>
      </section>
    </div>
  )
}
