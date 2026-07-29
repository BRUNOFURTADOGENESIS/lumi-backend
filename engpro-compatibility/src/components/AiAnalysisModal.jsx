import { useEffect } from 'react'
import { Sparkles, X } from 'lucide-react'

export default function AiAnalysisModal({ conflict, onClose }) {
  useEffect(() => {
    if (!conflict) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [conflict, onClose])

  if (!conflict) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-eng-border bg-eng-card p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-eng-accent/15 text-eng-accent">
              <Sparkles size={18} />
            </div>
            <h2 id="ai-modal-title" className="text-sm font-semibold text-eng-text">
              Analisar Conflito #{conflict.id} com IA
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-md p-1 text-eng-muted transition-colors hover:bg-eng-error/15 hover:text-eng-error"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-4 text-sm text-eng-muted">IA será implementada na próxima versão.</p>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-eng-accent px-4 py-2.5 text-sm font-semibold text-eng-bg transition-colors hover:bg-eng-accent/90"
        >
          Entendi
        </button>
      </div>
    </div>
  )
}
