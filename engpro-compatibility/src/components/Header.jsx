import { Boxes } from 'lucide-react'

export default function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-eng-border bg-eng-card px-4 sm:px-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-eng-accent/15 text-eng-accent">
        <Boxes size={20} strokeWidth={2.2} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tracking-tight text-eng-text">EngPro</span>
        <span className="text-lg font-light text-eng-muted">Compatibility</span>
      </div>
    </header>
  )
}
