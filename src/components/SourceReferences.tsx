import { MathText } from './MathText'
import { formatSources, type SourceReference } from '../import/schema'
export function SourceReferences({ sources }: { sources: SourceReference[] }) {
  if (!sources.length) return null
  return (
    <section className="source-references">
      <h3>Источники и страницы</h3>
      <MathText>{formatSources(sources)}</MathText>
    </section>
  )
}
