import { useRef, useState } from 'react'
import { CheckCircle2, UploadCloud, X } from 'lucide-react'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadField({ icon: Icon, label, file, onSelect, onClear }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFiles = (fileList) => {
    const picked = fileList?.[0]
    if (picked) onSelect(picked)
  }

  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-eng-muted">
        <Icon size={14} strokeWidth={2.2} />
        {label}
      </label>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`group relative flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
          file
            ? 'border-eng-success/40 bg-eng-success/10'
            : isDragOver
              ? 'border-eng-accent bg-eng-accent/10'
              : 'border-dashed border-eng-border bg-eng-bg hover:border-eng-accent/60 hover:bg-eng-accent/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".ifc"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {file ? (
          <CheckCircle2 size={18} className="shrink-0 text-eng-success" />
        ) : (
          <UploadCloud size={18} className="shrink-0 text-eng-muted group-hover:text-eng-accent" />
        )}

        <div className="min-w-0 flex-1">
          {file ? (
            <>
              <p className="truncate text-sm text-eng-text">{file.name}</p>
              <p className="text-xs text-eng-muted">{formatSize(file.size)}</p>
            </>
          ) : (
            <p className="text-sm text-eng-muted">
              Arraste ou <span className="text-eng-accent">selecione</span> um arquivo .ifc
            </p>
          )}
        </div>

        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClear()
              if (inputRef.current) inputRef.current.value = ''
            }}
            className="shrink-0 rounded-md p-1 text-eng-muted transition-colors hover:bg-eng-error/15 hover:text-eng-error"
            aria-label={`Remover ${label}`}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
