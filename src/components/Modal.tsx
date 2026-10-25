import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null), close=useRef(onClose); close.current=onClose
  useEffect(()=>{const node=ref.current!; const previous=document.activeElement as HTMLElement|null; node.showModal(); return ()=>{node.close();previous?.focus()}},[])
  return <dialog ref={ref} className={wide?'modal wide':'modal'} onCancel={e=>{e.preventDefault();close.current()}}><div className="modal-title"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20}/></button></div>{children}</dialog>
}
