import { Building2, Droplets, Layers3, Loader2, PlayCircle, Zap } from 'lucide-react'
import UploadField from './UploadField'

const DISCIPLINES = [
  { key: 'arquitetura', label: 'Arquitetura IFC', icon: Building2 },
  { key: 'estrutural', label: 'Estrutural IFC', icon: Layers3 },
  { key: 'hidraulico', label: 'Hidráulico IFC', icon: Droplets },
  { key: 'eletrica', label: 'Elétrica IFC', icon: Zap },
]

export default function Sidebar({ files, onSelect, onClear, onProcess, isProcessing }) {
  const uploadedCount = Object.values(files).filter(Boolean).length
  const canProcess = uploadedCount > 0 && !isProcessing

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-eng-border bg-eng-card p-4 sm:p-5 lg:w-80 lg:border-b-0 lg:border-r lg:overflow-y-auto">
      <div>
        <h2 className="text-sm font-semibold text-eng-text">Upload de Arquivos</h2>
        <p className="mt-0.5 text-xs text-eng-muted">
          {uploadedCount}/{DISCIPLINES.length} disciplinas carregadas
        </p>
      </div>

      <div className="flex flex-col gap-3.5">
        {DISCIPLINES.map(({ key, label, icon }) => (
          <UploadField
            key={key}
            icon={icon}
            label={label}
            file={files[key]}
            onSelect={(file) => onSelect(key, file)}
            onClear={() => onClear(key)}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={!canProcess}
        onClick={onProcess}
        className={`mt-auto flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
          canProcess
            ? 'bg-eng-accent text-eng-bg hover:bg-eng-accent/90 active:bg-eng-accent/80'
            : 'cursor-not-allowed bg-eng-border/60 text-eng-muted'
        }`}
      >
        {isProcessing ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <PlayCircle size={18} />
            Processar
          </>
        )}
      </button>
    </aside>
  )
}
