import { Box } from 'lucide-react'

export default function Viewer() {
  return (
    <main className="flex min-h-[420px] flex-1 items-center justify-center p-4 sm:p-6">
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-eng-border bg-eng-card/60">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-eng-accent/10 text-eng-accent">
          <Box size={30} strokeWidth={1.75} />
        </div>
        <p className="text-base font-medium text-eng-text">Visualizador IFC</p>
        <p className="text-sm text-eng-muted">Envie os arquivos e clique em "Processar" para visualizar o modelo</p>
      </div>
    </main>
  )
}
