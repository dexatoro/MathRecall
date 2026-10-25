import { z } from 'zod'
import { cardExchangeSchema, exchangeCardSchema } from './schema'
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export class CardImportError extends Error {
  constructor(public issues: string[]) {
    super(
      issues.slice(0, 20).join('\n') +
        (issues.length > 20 ? `\n…ещё ошибок: ${issues.length - 20}` : ''),
    )
    this.name = 'CardImportError'
  }
}
function validationError(error: z.ZodError) {
  return new CardImportError(
    error.issues.map((issue) => {
      const path =
        issue.path
          .map((part, index) =>
            typeof part === 'number' ? `[${part}]` : `${index ? '.' : ''}${String(part)}`,
          )
          .join('') || 'Документ'
      let message = issue.message
      if (issue.code === 'invalid_type')
        message = `Ожидается ${issue.expected === 'string' ? 'строка' : issue.expected === 'array' ? 'массив' : issue.expected === 'number' ? 'число' : issue.expected === 'object' ? 'объект' : issue.expected}`
      if (issue.code === 'too_small')
        message = `Значение пустое или меньше допустимого минимума (${String(issue.minimum)})`
      if (issue.code === 'too_big') message = `Превышен максимум: ${String(issue.maximum)}`
      if (issue.code === 'unrecognized_keys')
        message = `Неизвестные поля: ${issue.keys.join(', ')}. Уберите их`
      if (issue.code === 'invalid_value')
        message = `Допустимые значения: ${issue.values.map(String).join(', ')}`
      if (issue.code === 'invalid_format') message = 'Некорректный формат ссылки или значения'
      return `${path}: ${message}`
    }),
  )
}
export function validateExchange(input: unknown) {
  if (input && typeof input === 'object' && 'format' in input) {
    if (input.format === 'MathRecall')
      throw new CardImportError([
        'Это полная резервная копия. Восстановите её через «Настройки → Резервная копия», а не импорт карточек.',
      ])
    if (input.format === 'MathRecall.CardExchange' && 'version' in input && input.version !== 1)
      throw new CardImportError(['Неподдерживаемая версия обмена. Поддерживается version: 1.'])
  }
  const result = cardExchangeSchema.safeParse(input)
  if (!result.success) throw validationError(result.error)
  return result.data
}
export function validateDraft(input: unknown) {
  const result = exchangeCardSchema.safeParse(input)
  if (!result.success) throw validationError(result.error)
  return result.data
}
export function parseExchange(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES)
    throw new CardImportError([
      'JSON слишком большой. Максимум 2 МБ и 500 карточек за один импорт.',
    ])
  const trimmed = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    throw new CardImportError([
      'Не удалось прочитать JSON. Проверьте двойные кавычки, запятые и экранирование LaTeX: в JSON обратную косую черту нужно записывать дважды (\\\\).',
    ])
  }
  return validateExchange(value)
}
