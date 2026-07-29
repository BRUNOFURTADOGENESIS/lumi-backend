const PENALTY_PER_CONFLICT = 5

/** Simple index: 100% minus a fixed penalty per conflict found, floored at 0. */
export function computeCompatibilityIndex(conflictCount) {
  return Math.max(0, 100 - conflictCount * PENALTY_PER_CONFLICT)
}

export function getCompatibilityStatus(index) {
  if (index >= 80) return { label: 'good', color: '#22c55e' }
  if (index >= 50) return { label: 'warning', color: '#f59e0b' }
  return { label: 'critical', color: '#ef4444' }
}
