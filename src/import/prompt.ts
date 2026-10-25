import { exchangeJsonSchema } from './schema'
import { exchangeExample } from './example'
export function generationPrompt() {
  return `Подготовь математические карточки для MathRecall по материалу, который я пришлю следующим сообщением. Не вызывай API и не добавляй расписание повторений.

Ответь одним валидным JSON-объектом без Markdown-ограждений и комментариев. Строго соблюдай приложенную JSON Schema (формат MathRecall.CardExchange, version 1). Все поля карточки обязательны. Если значений нет, используй [] для массивов, null для неизвестных полей источника, "" для описания билета. Не включай UUID, FSRS, оценки, историю повторений или другие поля.

Типы: definition — определения/теоремы, proof — утверждение и доказательство, problem — условие и решение. question и answer — Markdown с LaTeX. В JSON экранируй обратную косую черту LaTeX: например ${JSON.stringify(exchangeExample.cards[0].question)}. Для блочной формулы используй $$ на отдельных строках; переносы строк экранируются согласно JSON. Сохраняй регистр математических обозначений.

subject — название предмета. topicPath — массив названий тем от корня к конкретной теме; [] означает без темы. tickets — массив объектов name/description, все билеты относятся к последней теме topicPath. Если topicPath пуст, tickets тоже должен быть пуст. Используй одинаковые названия предметов и тем для связанных карточек.

hints — самостоятельные пошаговые подсказки. sources — только известные источники: title, url (http/https или null), pageStart и pageEnd (положительные целые или null). Страницы считаются с 1. pageEnd требует pageStart и не может быть меньше него. Для PDF url может вести к самому файлу; MathRecall добавит #page=N. Не выдумывай ссылки и страницы; если источник неизвестен, sources: []. Совокупный текст ссылок должен помещаться в 2000 символов.

Не делай одинаковые карточки. Разделяй большие доказательства на осмысленные вопросы. Не придумывай математические факты за пределами материала. За один ответ — от 1 до 500 карточек. Они попадут в черновики для проверки человеком.

JSON SCHEMA:
${JSON.stringify(exchangeJsonSchema, null, 2)}

ПРИМЕР ФОРМАТА (материал карточек замени на присланный мной):
${JSON.stringify(exchangeExample, null, 2)}

Теперь дождись моего материала.`
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
