import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { IfcViewerAPI } from 'web-ifc-viewer'
import { Color, Mesh, MeshLambertMaterial } from 'three'
import { Box, Eye, EyeOff, RotateCcw, Undo2 } from 'lucide-react'
import { DISCIPLINE_VIEWER_COLORS } from '../lib/disciplines'
import { detectCollisions, extractElementBoxes } from '../lib/collisionDetection'
import { buildConflict } from '../lib/conflictModel'

const HIGHLIGHT_COLOR_A = 0xef4444 // Elemento A: vermelho
const HIGHLIGHT_COLOR_B = 0xf97316 // Elemento B: laranja
const FADE_OPACITY = 0.18

const Viewer = forwardRef(function Viewer({ onClearFocus }, ref) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const modelsRef = useRef({})
  const visibilityRef = useRef({})
  const fadedMeshesRef = useRef({})
  const highlightMeshesRef = useRef([])
  const [loadedDisciplines, setLoadedDisciplines] = useState([])
  const [visibility, setVisibility] = useState({})
  const [focusedConflictId, setFocusedConflictId] = useState(null)

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

  const clearHighlight = () => {
    const viewer = viewerRef.current
    if (!viewer) return
    const scene = viewer.context.getScene()

    Object.entries(fadedMeshesRef.current).forEach(([discipline, ghost]) => {
      scene.remove(ghost)
      ghost.material.dispose()
      const model = modelsRef.current[discipline]
      if (model) model.visible = visibilityRef.current[discipline] ?? true
    })
    fadedMeshesRef.current = {}

    highlightMeshesRef.current.forEach((mesh) => {
      scene.remove(mesh)
      mesh.material.dispose()
    })
    highlightMeshesRef.current = []
  }

  useImperativeHandle(ref, () => ({
    async processFiles(files) {
      const viewer = viewerRef.current
      if (!viewer) return { conflicts: [], totalElements: 0 }

      clearHighlight()
      setFocusedConflictId(null)

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
      const initialVisibility = Object.fromEntries(loaded.map((d) => [d, true]))
      setVisibility(initialVisibility)
      visibilityRef.current = initialVisibility

      if (loaded.length > 0) {
        viewer.context.fitToFrame()
        viewer.context.ifcCamera.cameraControls.saveState()
      }

      const elementsByDiscipline = Object.fromEntries(
        Object.entries(modelsRef.current).map(([discipline, model]) => [
          discipline,
          extractElementBoxes(model),
        ]),
      )
      const collisions = detectCollisions(elementsByDiscipline)
      const totalElements = Object.values(elementsByDiscipline).reduce((sum, arr) => sum + arr.length, 0)

      const nameCache = new Map()
      const resolveName = async (discipline, expressID) => {
        const cacheKey = `${discipline}:${expressID}`
        if (nameCache.has(cacheKey)) return nameCache.get(cacheKey)

        const model = modelsRef.current[discipline]
        let name = `Elemento #${expressID}`
        try {
          const props = await viewer.IFC.getProperties(model.modelID, expressID, false)
          if (props?.Name?.value) name = props.Name.value
        } catch {
          // keep fallback name
        }
        nameCache.set(cacheKey, name)
        return name
      }

      const conflicts = []
      for (const collision of collisions) {
        const [elementAName, elementBName] = await Promise.all([
          resolveName(collision.disciplineA, collision.elementA.expressID),
          resolveName(collision.disciplineB, collision.elementB.expressID),
        ])
        conflicts.push(
          buildConflict({
            id: String(conflicts.length + 1).padStart(3, '0'),
            collision,
            elementAName,
            elementBName,
          }),
        )
      }

      return { conflicts, totalElements }
    },

    focusConflict(conflict) {
      const viewer = viewerRef.current
      const modelA = modelsRef.current[conflict.disciplineA]
      const modelB = modelsRef.current[conflict.disciplineB]
      if (!viewer || !modelA || !modelB) return

      clearHighlight()

      const scene = viewer.context.getScene()
      const ifcManager = viewer.IFC.loader.ifcManager

      Object.entries(modelsRef.current).forEach(([discipline, model]) => {
        const ghost = new Mesh(
          model.geometry,
          new MeshLambertMaterial({ color: 0xffffff, opacity: FADE_OPACITY, transparent: true, depthWrite: false }),
        )
        ghost.applyMatrix4(model.matrixWorld)
        scene.add(ghost)
        fadedMeshesRef.current[discipline] = ghost
        model.visible = false
      })

      const subsetA = ifcManager.createSubset({
        modelID: modelA.modelID,
        ids: [conflict.expressIDA],
        material: new MeshLambertMaterial({ color: HIGHLIGHT_COLOR_A }),
        scene,
        removePrevious: true,
        customID: 'conflict-element-a',
      })
      const subsetB = ifcManager.createSubset({
        modelID: modelB.modelID,
        ids: [conflict.expressIDB],
        material: new MeshLambertMaterial({ color: HIGHLIGHT_COLOR_B }),
        scene,
        removePrevious: true,
        customID: 'conflict-element-b',
      })
      highlightMeshesRef.current = [subsetA, subsetB]

      viewer.context.ifcCamera.cameraControls.fitToBox(conflict.box, true, {
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 1,
        paddingBottom: 1,
      })

      setFocusedConflictId(conflict.id)
    },

    clearFocus() {
      clearHighlight()
      viewerRef.current?.context.ifcCamera.cameraControls.reset(true)
      setFocusedConflictId(null)
    },
  }))

  const resetCamera = () => {
    viewerRef.current?.context.ifcCamera.cameraControls.reset(true)
  }

  const handleBackToOverview = () => {
    clearHighlight()
    viewerRef.current?.context.ifcCamera.cameraControls.reset(true)
    setFocusedConflictId(null)
    onClearFocus?.()
  }

  const toggleVisibility = (discipline) => {
    setVisibility((prev) => {
      const next = !prev[discipline]
      const model = modelsRef.current[discipline]
      if (model && focusedConflictId === null) model.visible = next
      visibilityRef.current = { ...visibilityRef.current, [discipline]: next }
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

          {focusedConflictId !== null && (
            <button
              type="button"
              onClick={handleBackToOverview}
              className="flex items-center gap-1.5 rounded-full border border-eng-accent bg-eng-accent/15 px-3 py-1.5 text-xs font-medium text-eng-accent transition-colors hover:bg-eng-accent/25"
            >
              <Undo2 size={13} />
              Voltar para visão geral
            </button>
          )}

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
