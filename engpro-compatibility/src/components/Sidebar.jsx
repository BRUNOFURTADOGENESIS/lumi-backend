import { AlertTriangle, Building2, Droplets, Layers3, Loader2, PlayCircle, Zap } from 'lucide-react'
import UploadField from './UploadField'
import { DISCIPLINE_CONFLICT_LABELS } from '../lib/disciplines'

const DISCIPLINES = [
  { key: 'arquitetura', label: 'Arquitetura IFC', icon: Building2 },
  { key: 'estrutural', label: 'Estrutural IFC', icon: Layers3 },
  { key: 'hidraulico', label: 'Hidráulico IFC', icon: Droplets },
  { key: 'eletrica', label: 'Elétrica IFC', icon: Zap },
]

export default function Sidebar({ files, onSelect, onClear, onProcess, isProcessing, skippedDisciplines = [] }) {
  const uploadedCount = Object.values(files).filter(Boolean).length
  const allUploaded = uploadedCount === DISCIPLINES.length
  const canProcess = allUploaded && !isProcessing

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-eng-border bg-eng-card p-4 sm:p-5 lg:w-80 lg:border-b-0 lg:border-r lg:overflow-y-auto">
      <div>
        <h2 className="text-sm font-semibold text-eng-text">Upload de Arquivos</h2>
        <p className="mt-0.5 text-xs text-eng-muted">
          {uploadedCount}/{DISCIPLINES.length} arquivos obrigatórios enviados
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

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          disabled={!canProcess}
          onClick={onProcess}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
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
        {!allUploaded && (
          <p className="text-center text-xs text-eng-muted">
            Envie os {DISCIPLINES.length} arquivos obrigatórios para habilitar o processamento.
          </p>
        )}
        {skippedDisciplines.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {skippedDisciplines.map((d) => DISCIPLINE_CONFLICT_LABELS[d] ?? d).join(', ')}:{' '}
              {skippedDisciplines.length === 1 ? 'formato' : 'formatos'} sem suporte a visualização 3D
              nesta versão — arquivo anexado, mas não entra no visualizador nem na detecção de conflitos.
            </span>
          </p>
        )}
      </div>
    </aside>
  )
}
