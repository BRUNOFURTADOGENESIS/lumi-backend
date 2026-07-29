import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { IfcViewerAPI } from 'web-ifc-viewer'
import { Color } from 'three'
import { Box, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { DISCIPLINE_VIEWER_COLORS } from '../lib/disciplines'

const Viewer = forwardRef(function Viewer(_props, ref) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const modelsRef = useRef({})
  const [loadedDisciplines, setLoadedDisciplines] = useState([])
  const [visibility, setVisibility] = useState({})

  useEffect(() => {
    const container = containerRef.current
    const viewer = new IfcViewerAPI({
      container,
      backgroundColor: new Color(0x0d1117),
    })
    viewer.axes.setAxes(8)
    viewer.grid.setGrid(40, 40)
    viewer.IFC.setWasmPath('/ifc-wasm/')
    viewer.context.ifcCamera.cameraControls.saveState()
    viewerRef.current = viewer

    return () => {
      viewer.dispose()
      viewerRef.current = null
      if (container) container.replaceChildren()
    }
  }, [])

  useImperativeHandle(ref, () => ({
    async processFiles(files) {
      const viewer = viewerRef.current
      if (!viewer) return

      Object.values(modelsRef.current).forEach((model) => {
        if (model) viewer.context.scene.removeModel(model)
      })
      modelsRef.current = {}

      const entries = Object.entries(files).filter(([, file]) => Boolean(file))

      for (const [discipline, file] of entries) {
        const model = await viewer.IFC.loadIfc(file, false)
        const color = DISCIPLINE_VIEWER_COLORS[discipline]?.hex
        if (color !== undefined) {
          const materials = Array.isArray(model.material) ? model.material : [model.material]
          materials.forEach((mat) => mat?.color?.set(color))
        }
        modelsRef.current[discipline] = model
      }

      const loaded = Object.keys(modelsRef.current)
      setLoadedDisciplines(loaded)
      setVisibility(Object.fromEntries(loaded.map((d) => [d, true])))

      if (loaded.length > 0) {
        viewer.context.fitToFrame()
        viewer.context.ifcCamera.cameraControls.saveState()
      }
    },
  }))

  const resetCamera = () => {
    viewerRef.current?.context.ifcCamera.cameraControls.reset(true)
  }

  const toggleVisibility = (discipline) => {
    setVisibility((prev) => {
      const next = !prev[discipline]
      const model = modelsRef.current[discipline]
      if (model) model.visible = next
      return { ...prev, [discipline]: next }
    })
  }

  const isEmpty = loadedDisciplines.length === 0

  return (
    <main className="flex min-h-[420px] flex-1 flex-col gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-eng-text">
          <Box size={16} className="text-eng-accent" />
          Visualizador IFC
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {loadedDisciplines.map((discipline) => {
            const info = DISCIPLINE_VIEWER_COLORS[discipline]
            const visible = visibility[discipline]
            return (
              <button
                key={discipline}
                type="button"
                onClick={() => toggleVisibility(discipline)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  visible
                    ? 'border-eng-border bg-eng-card text-eng-text'
                    : 'border-eng-border/60 bg-eng-card/40 text-eng-muted'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: info?.swatch, opacity: visible ? 1 : 0.4 }}
                />
                {info?.label ?? discipline}
                {visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            )
          })}

          <button
            type="button"
            onClick={resetCamera}
            className="flex items-center gap-1.5 rounded-full border border-eng-border bg-eng-card px-3 py-1.5 text-xs font-medium text-eng-text transition-colors hover:border-eng-accent/60 hover:text-eng-accent"
          >
            <RotateCcw size={13} />
            Reset Camera
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-xl border border-eng-border bg-eng-card/60">
        <div ref={containerRef} className="absolute inset-0" />

        {isEmpty && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <p className="rounded-full border border-eng-border bg-eng-bg/80 px-4 py-1.5 text-sm text-eng-muted backdrop-blur-sm">
              Envie os arquivos e clique em "Processar" para visualizar o modelo
            </p>
          </div>
        )}
      </div>
    </main>
  )
})

export default Viewer
