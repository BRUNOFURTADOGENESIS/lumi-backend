import { getCompatibilityStatus } from '../lib/compatibility'

const SIZE = 88
const STROKE = 9
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function CompatibilityMeter({ value }) {
  const { color } = getCompatibilityStatus(value)
  const filled = (value / 100) * CIRCUMFERENCE

  return (
    <div className="flex items-center gap-3">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          style={{ transition: 'stroke-dasharray 400ms ease' }}
        />
        <text
          x={SIZE / 2}
          y={SIZE / 2}
          transform={`rotate(90 ${SIZE / 2} ${SIZE / 2})`}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-eng-text"
          style={{ fontSize: 20, fontWeight: 600 }}
        >
          {value}%
        </text>
      </svg>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-eng-muted">Compatibilidade</p>
        <p className="text-xs text-eng-muted">do projeto</p>
      </div>
    </div>
  )
}
