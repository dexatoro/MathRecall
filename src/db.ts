import Dexie, { type EntityTable } from 'dexie'
import type {
  Subject,
  Topic,
  Ticket,
  StudyCard,
  TicketCard,
  ReviewState,
  ReviewLog,
  Settings,
  Snapshot,
} from './model'
export class MathDB extends Dexie {
  subjects!: EntityTable<Subject, 'id'>
  topics!: EntityTable<Topic, 'id'>
  tickets!: EntityTable<Ticket, 'id'>
  cards!: EntityTable<StudyCard, 'id'>
  links!: EntityTable<TicketCard, 'id'>
  states!: EntityTable<ReviewState, 'cardId'>
  logs!: EntityTable<ReviewLog, 'id'>
  settings!: EntityTable<Settings, 'id'>
  constructor(name = 'MathRecall') {
    super(name)
    this.version(1).stores({
      subjects: 'id,name',
      topics: 'id,subjectId,parentId',
      tickets: 'id,topicId',
      cards: 'id,subjectId,topicId,type',
      links: 'id,ticketId,cardId,&[ticketId+cardId]',
      states: 'cardId,due,state',
      logs: 'id,cardId,review',
      settings: 'id',
    })
  }
  async snapshot(): Promise<Snapshot> {
    return this.transaction('r', this.tables, async () => ({
      subjects: await this.subjects.toArray(),
      topics: await this.topics.toArray(),
      tickets: await this.tickets.toArray(),
      cards: await this.cards.toArray(),
      links: await this.links.toArray(),
      states: await this.states.toArray(),
      logs: await this.logs.toArray(),
      settings: await this.settings.toArray(),
    }))
  }
}
export const db = new MathDB()
