import { AlertTriangle, Boxes, Flame, LayoutGrid } from 'lucide-react'
import CompatibilityMeter from './CompatibilityMeter'
import { computeCompatibilityIndex } from '../lib/compatibility'

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-eng-border bg-eng-bg/60 px-4 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-eng-accent/10 text-eng-accent">
        <Icon size={16} />
      </div>
      <div>
        <p className="text-lg font-semibold leading-tight text-eng-text">{value}</p>
        <p className="text-xs text-eng-muted">{label}</p>
      </div>
    </div>
  )
}

export default function StatsPanel({ totalElements, totalDisciplines, conflicts, hasProcessed }) {
  if (!hasProcessed) return null

  const criticalConflicts = conflicts.filter((c) => c.severity === 'Alta').length
  const compatibilityIndex = computeCompatibilityIndex(conflicts.length)

  return (
    <div className="flex flex-col gap-3 border-b border-eng-border bg-eng-card px-4 py-3 sm:flex-row sm:items-center sm:px-6">
      <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile icon={Boxes} label="Total de elementos" value={totalElements} />
        <StatTile icon={LayoutGrid} label="Total de disciplinas" value={totalDisciplines} />
        <StatTile icon={AlertTriangle} label="Total de conflitos" value={conflicts.length} />
        <StatTile icon={Flame} label="Conflitos críticos" value={criticalConflicts} />
      </div>

      <div className="rounded-lg border border-eng-border bg-eng-bg/60 px-4 py-2 sm:shrink-0">
        <CompatibilityMeter value={compatibilityIndex} />
      </div>
    </div>
  )
}
