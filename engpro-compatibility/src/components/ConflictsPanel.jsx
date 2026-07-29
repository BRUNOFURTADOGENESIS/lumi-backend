import { useMemo, useState } from 'react'
import { AlertTriangle, Search, Sparkles, ShieldAlert, X } from 'lucide-react'
import { DISCIPLINE_CONFLICT_LABELS } from '../lib/disciplines'

const DISCIPLINE_FILTERS = ['arquitetura', 'estrutural', 'eletrica', 'hidraulico']
const SEVERITY_FILTERS = ['Alta', 'Média', 'Baixa']

const SEVERITY_BADGE_STYLES = {
  Alta: 'bg-eng-error/20 text-eng-error',
  Média: 'bg-amber-500/20 text-amber-400',
  Baixa: 'bg-eng-border text-eng-muted',
}

const SEVERITY_CHIP_ACTIVE_STYLES = {
  Alta: 'border-eng-error bg-eng-error/15 text-eng-error',
  Média: 'border-amber-500 bg-amber-500/15 text-amber-400',
  Baixa: 'border-eng-muted bg-eng-border text-eng-text',
}

function toggleInSet(set, value) {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export default function ConflictsPanel({
  conflicts = [],
  hasProcessed = false,
  activeConflictId = null,
  onSelectConflict,
  onAnalyzeConflict,
}) {
  const [disciplineFilter, setDisciplineFilter] = useState(() => new Set())
  const [severityFilter, setSeverityFilter] = useState(() => new Set())
  const [search, setSearch] = useState('')

  const filteredConflicts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return conflicts.filter((conflict) => {
      if (
        disciplineFilter.size > 0 &&
        !disciplineFilter.has(conflict.disciplineA) &&
        !disciplineFilter.has(conflict.disciplineB)
      ) {
        return false
      }
      if (severityFilter.size > 0 && !severityFilter.has(conflict.severity)) {
        return false
      }
      if (
        query &&
        !conflict.elementA.toLowerCase().includes(query) &&
        !conflict.elementB.toLowerCase().includes(query)
      ) {
        return false
      }
      return true
    })
  }, [conflicts, disciplineFilter, severityFilter, search])

  const hasFilters = disciplineFilter.size > 0 || severityFilter.size > 0 || search.trim() !== ''

  const clearFilters = () => {
    setDisciplineFilter(new Set())
    setSeverityFilter(new Set())
    setSearch('')
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-eng-border bg-eng-card p-4 sm:p-5 lg:w-80 lg:border-t-0 lg:border-l lg:overflow-y-auto">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-eng-text">Conflitos</h2>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-medium text-eng-muted transition-colors hover:text-eng-accent"
            >
              <X size={12} />
              Limpar filtros
            </button>
          )}
        </div>
        {hasProcessed && (
          <p className="mt-0.5 text-xs text-eng-muted">
            Foram encontrados {String(conflicts.length).padStart(2, '0')}{' '}
            {conflicts.length === 1 ? 'conflito' : 'conflitos'}.
          </p>
        )}
      </div>

      {hasProcessed && conflicts.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-eng-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por elemento..."
              className="w-full rounded-lg border border-eng-border bg-eng-bg py-1.5 pl-8 pr-3 text-xs text-eng-text placeholder:text-eng-muted focus:border-eng-accent focus:outline-none"
            />
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-eng-muted">Disciplina</p>
            <div className="flex flex-wrap gap-1.5">
              {DISCIPLINE_FILTERS.map((discipline) => {
                const active = disciplineFilter.has(discipline)
                return (
                  <button
                    key={discipline}
                    type="button"
                    onClick={() => setDisciplineFilter((prev) => toggleInSet(prev, discipline))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? 'border-eng-accent bg-eng-accent/15 text-eng-accent'
                        : 'border-eng-border bg-eng-bg text-eng-muted hover:text-eng-text'
                    }`}
                  >
                    {DISCIPLINE_CONFLICT_LABELS[discipline]}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-eng-muted">Severidade</p>
            <div className="flex flex-wrap gap-1.5">
              {SEVERITY_FILTERS.map((severity) => {
                const active = severityFilter.has(severity)
                return (
                  <button
                    key={severity}
                    type="button"
                    onClick={() => setSeverityFilter((prev) => toggleInSet(prev, severity))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? SEVERITY_CHIP_ACTIVE_STYLES[severity]
                        : 'border-eng-border bg-eng-bg text-eng-muted hover:text-eng-text'
                    }`}
                  >
                    {severity}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {conflicts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-eng-border/70 px-4 py-10 text-center">
          <ShieldAlert size={28} className="text-eng-muted" strokeWidth={1.75} />
          <p className="text-sm text-eng-muted">Nenhum conflito processado.</p>
        </div>
      ) : filteredConflicts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-eng-border/70 px-4 py-10 text-center">
          <Search size={28} className="text-eng-muted" strokeWidth={1.75} />
          <p className="text-sm text-eng-muted">Nenhum conflito corresponde aos filtros.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filteredConflicts.map((conflict) => {
            const isActive = conflict.id === activeConflictId
            return (
              <li key={conflict.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectConflict?.(conflict)}
                  onKeyDown={(e) => e.key === 'Enter' && onSelectConflict?.(conflict)}
                  className={`w-full cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                    isActive
                      ? 'border-eng-accent bg-eng-accent/10'
                      : 'border-eng-border bg-eng-bg/60 hover:border-eng-accent/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-eng-text">Conflito #{conflict.id}</span>
                    <span
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_BADGE_STYLES[conflict.severity]}`}
                    >
                      <AlertTriangle size={11} />
                      {conflict.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-eng-accent">
                    {conflict.disciplineLabelA} × {conflict.disciplineLabelB}
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-eng-muted">
                    <p>
                      <span className="text-eng-text">Elemento A:</span> {conflict.elementA}
                    </p>
                    <p>
                      <span className="text-eng-text">Elemento B:</span> {conflict.elementB}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAnalyzeConflict?.(conflict)
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-eng-accent/40 bg-eng-accent/10 py-1.5 text-xs font-medium text-eng-accent transition-colors hover:bg-eng-accent/20"
                  >
                    <Sparkles size={13} />
                    Analisar com IA
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
