import { useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, UploadCloud, X } from 'lucide-react'
import { ACCEPTED_EXTENSIONS, isAcceptedFile, isViewableFile } from '../lib/fileFormats'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadField({ icon: Icon, label, file, onSelect, onClear }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(timer)
  }, [error])

  const handleFiles = (fileList) => {
    const picked = fileList?.[0]
    if (!picked) return

    if (!isAcceptedFile(picked.name)) {
      setError(`Formato não suportado. Aceitos: ${ACCEPTED_EXTENSIONS.join(', ')}`)
      return
    }

    setError(null)
    onSelect(picked)
  }

  const fileIsViewable = file ? isViewableFile(file.name) : true

  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-eng-muted">
        <Icon size={14} strokeWidth={2.2} />
        {label}
        <span className="text-eng-error">*</span>
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
          error
            ? 'border-eng-error/50 bg-eng-error/10'
            : file
              ? fileIsViewable
                ? 'border-eng-success/40 bg-eng-success/10'
                : 'border-amber-500/40 bg-amber-500/10'
              : isDragOver
                ? 'border-eng-accent bg-eng-accent/10'
                : 'border-dashed border-eng-border bg-eng-bg hover:border-eng-accent/60 hover:bg-eng-accent/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {error ? (
          <AlertCircle size={18} className="shrink-0 text-eng-error" />
        ) : file ? (
          fileIsViewable ? (
            <CheckCircle2 size={18} className="shrink-0 text-eng-success" />
          ) : (
            <AlertTriangle size={18} className="shrink-0 text-amber-400" />
          )
        ) : (
          <UploadCloud size={18} className="shrink-0 text-eng-muted group-hover:text-eng-accent" />
        )}

        <div className="min-w-0 flex-1">
          {error ? (
            <p className="text-sm text-eng-error">{error}</p>
          ) : file ? (
            <>
              <p className="truncate text-sm text-eng-text">{file.name}</p>
              <p className="text-xs text-eng-muted">
                {formatSize(file.size)}
                {!fileIsViewable && ' · sem visualização 3D neste formato'}
              </p>
            </>
          ) : (
            <p className="text-sm text-eng-muted">
              Arraste ou <span className="text-eng-accent">selecione</span> um arquivo de projeto
            </p>
          )}
        </div>

        {file && !error && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClear()
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
