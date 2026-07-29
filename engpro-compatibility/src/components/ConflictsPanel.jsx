import { AlertTriangle, ShieldAlert } from 'lucide-react'

export default function ConflictsPanel({ conflicts = [] }) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-eng-border bg-eng-card p-4 sm:p-5 lg:w-80 lg:border-t-0 lg:border-l lg:overflow-y-auto">
      <div>
        <h2 className="text-sm font-semibold text-eng-text">Conflitos</h2>
        {conflicts.length > 0 && (
          <p className="mt-0.5 text-xs text-eng-muted">
            {conflicts.length} {conflicts.length === 1 ? 'conflito encontrado' : 'conflitos encontrados'}
          </p>
        )}
      </div>

      {conflicts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-eng-border/70 px-4 py-10 text-center">
          <ShieldAlert size={28} className="text-eng-muted" strokeWidth={1.75} />
          <p className="text-sm text-eng-muted">Nenhum conflito processado.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {conflicts.map((conflict) => (
            <li key={conflict.id} className="rounded-lg border border-eng-error/30 bg-eng-error/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-eng-text">Conflito #{conflict.id}</span>
                <span className="flex items-center gap-1 rounded-full bg-eng-error/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-eng-error">
                  <AlertTriangle size={11} />
                  {conflict.status}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-eng-accent">{conflict.disciplinePair}</p>
              <div className="mt-2 space-y-1 text-xs text-eng-muted">
                <p>
                  <span className="text-eng-text">Elemento A:</span> {conflict.elementA}
                </p>
                <p>
                  <span className="text-eng-text">Elemento B:</span> {conflict.elementB}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
