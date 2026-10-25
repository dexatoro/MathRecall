import { db } from '../db'
import { repository } from './repository'
import { timestamps } from '../model'
export async function addDemo() {
  await db.transaction('rw', db.tables, async () => {
    const examples = [
      {
        name: 'Математический анализ',
        topic: 'Демо · Последовательности',
        type: 'definition' as const,
        question: 'Что значит $a_n \\to a$?',
        answer:
          'Для любого $\\varepsilon > 0$ существует $N \\in \\mathbb{N}$, такое что при $n \\geq N$ выполняется $|a_n-a|<\\varepsilon$.',
        hints: [],
      },
      {
        name: 'Алгебра',
        topic: 'Демо · Группы',
        type: 'proof' as const,
        question: 'Докажите единственность нейтрального элемента группы.',
        answer: 'Пусть $e$ и $e\u0027$ — нейтральные элементы. Тогда $e=e\\cdot e\u0027=e\u0027$.',
        hints: ['Рассмотрите произведение двух нейтральных элементов.'],
      },
      {
        name: 'Дискретная математика',
        topic: 'Демо · Комбинаторика',
        type: 'problem' as const,
        question: 'Сколько существует подмножеств множества из $n$ элементов?',
        answer:
          '$2^n$. Для каждого элемента независимо выбираем: включить его в подмножество или нет.',
        hints: ['Сколько вариантов есть для каждого элемента?'],
      },
    ]
    for (const e of examples) {
      const subject = (await db.subjects.where('name').equals(e.name).first()) ?? {
        ...timestamps(),
        name: e.name,
      }
      await db.subjects.put(subject)
      if (
        await db.topics
          .where('subjectId')
          .equals(subject.id)
          .filter((t) => t.name === e.topic)
          .first()
      )
        continue
      const topic = { ...timestamps(), name: e.topic, subjectId: subject.id, parentId: null }
      await repository.saveTopic(topic)
      const ticket = {
        ...timestamps(),
        name: 'Демо · Основные понятия',
        description: 'Необязательные примеры MathRecall',
        topicId: topic.id,
      }
      await repository.saveTicket(ticket)
      await repository.saveCard(
        {
          ...timestamps(),
          subjectId: subject.id,
          topicId: topic.id,
          type: e.type,
          question: e.question,
          answer: e.answer,
          hints: e.hints,
          source: 'Демонстрационный пример MathRecall',
        },
        [ticket.id],
      )
    }
  })
}
