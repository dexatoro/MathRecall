import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MathText } from '../components/MathText'
describe('Безопасный математический Markdown', () => {
  it('рисует формулы KaTeX и Markdown', () => {
    const html = renderToStaticMarkup(
      <MathText>
        {'**Предел:** $a_n \\to a$\n\n$$\n\\sum_{i=1}^n i = \\frac{n(n+1)}{2}\n$$'}
      </MathText>,
    )
    expect(html).toContain('class="katex"')
    expect(html).toContain('<strong>Предел:</strong>')
    expect(html).toContain('katex-display')
  })
  it('не исполняет HTML, JS-ссылки и внешние изображения', () => {
    const html = renderToStaticMarkup(
      <MathText>
        {
          '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[опасная ссылка](javascript:alert%281%29)\n\n![трекер](https://tracker.example/pixel.png)'
        }
      </MathText>,
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="javascript:')
  })
  it('не разрешает опасные команды KaTeX', () => {
    const html = renderToStaticMarkup(<MathText>{'$\\href{javascript:alert(1)}{click}$'}</MathText>)
    expect(html).not.toContain('href="javascript:')
  })
})
