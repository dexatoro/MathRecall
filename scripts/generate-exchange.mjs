import { writeFile, mkdir } from 'node:fs/promises'
import { exchangeJsonSchema } from '../src/import/schema.ts'
import { exchangeExample } from '../src/import/example.ts'
const directory = new URL('../public/formats/', import.meta.url)
await mkdir(directory, { recursive: true })
await writeFile(
  new URL('mathrecall-card-exchange.v1.schema.json', directory),
  JSON.stringify(exchangeJsonSchema, null, 2) + '\n',
)
await writeFile(
  new URL('mathrecall-card-exchange.v1.example.json', directory),
  JSON.stringify(exchangeExample, null, 2) + '\n',
)
