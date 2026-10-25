import { useEffect, useState } from 'react'
export function OfflineStatus() {
  const [status, setStatus] = useState('Проверяем готовность офлайн-кэша…')
  useEffect(() => {
    let active = true
    if (!('serviceWorker' in navigator)) {
      setStatus(
        'Этот браузер не поддерживает офлайн-кэш. Для загрузки без сети откройте приложение в обычном браузере с поддержкой Service Worker.',
      )
    } else if (import.meta.env.DEV) {
      setStatus('Офлайн-кэш включается в production-сборке: запустите build и preview.')
    } else {
      void navigator.serviceWorker.ready.then(() => {
        if (active)
          setStatus(
            'Готово к работе без сети. Приложение и математические шрифты сохранены на устройстве.',
          )
      })
    }
    return () => {
      active = false
    }
  }, [])
  return (
    <p className="muted small" role="status">
      {status}
    </p>
  )
}
