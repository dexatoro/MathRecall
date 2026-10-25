import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
export const MathText=memo(function MathText({children}:{children:string}) {
  return <div className="math-content"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{trust:false,throwOnError:false}]]} components={{img:()=>null,a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{children}</ReactMarkdown></div>
})
