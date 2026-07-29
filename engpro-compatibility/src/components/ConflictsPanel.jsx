import { ShieldAlert } from 'lucide-react'

export default function ConflictsPanel({ conflicts = [] }) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-eng-border bg-eng-card p-4 sm:p-5 lg:w-80 lg:border-t-0 lg:border-l lg:overflow-y-auto">
      <h2 className="text-sm font-semibold text-eng-text">Conflitos</h2>

      {conflicts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-eng-border/70 px-4 py-10 text-center">
          <ShieldAlert size={28} className="text-eng-muted" strokeWidth={1.75} />
          <p className="text-sm text-eng-muted">Nenhum conflito processado.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {conflicts.map((conflict) => (
            <li key={conflict.id} className="rounded-lg border border-eng-error/30 bg-eng-error/10 px-3 py-2 text-sm text-eng-text">
              {conflict.description}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
