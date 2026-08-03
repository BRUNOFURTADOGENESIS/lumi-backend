import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { IfcViewerAPI } from 'web-ifc-viewer'
import { Color, DoubleSide, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshLambertMaterial } from 'three'
import { Box, Eye, EyeOff, RotateCcw, Undo2 } from 'lucide-react'
import { DISCIPLINE_VIEWER_COLORS } from '../lib/disciplines'
import { detectCollisions, extractElementBoxes } from '../lib/collisionDetection'
import { buildConflict } from '../lib/conflictModel'
import { isViewableFile } from '../lib/fileFormats'
import { extractDxfElementBoxes, loadDxfFile } from '../lib/dxfLoader'

const HIGHLIGHT_COLOR_A = 0xef4444 // Elemento A: vermelho
const HIGHLIGHT_COLOR_B = 0xf97316 // Elemento B: laranja
const FADE_OPACITY = 0.18

function getObject3D(entry) {
  return entry.kind === 'ifc' ? entry.model : entry.group
}

function buildGhost(entry) {
  if (entry.kind === 'ifc') {
    const ghost = new Mesh(
      entry.model.geometry,
      new MeshLambertMaterial({ color: 0xffffff, opacity: FADE_OPACITY, transparent: true, depthWrite: false }),
    )
    ghost.applyMatrix4(entry.model.matrixWorld)
    return ghost
  }

  const ghost = entry.group.clone(true)
  const fadeLineMaterial = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: FADE_OPACITY })
  const fadeFaceMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: FADE_OPACITY })
  ghost.traverse((child) => {
    if (child.isLine) child.material = fadeLineMaterial
    else if (child.isMesh) child.material = fadeFaceMaterial
  })
  return ghost
}

function buildHighlight(entry, expressID, colorHex, customID, scene, ifcManager) {
  if (entry.kind === 'ifc') {
    return ifcManager.createSubset({
      modelID: entry.model.modelID,
      ids: [expressID],
      material: new MeshLambertMaterial({ color: colorHex }),
      scene,
      removePrevious: true,
      customID,
    })
  }

  const meta = entry.elements.get(expressID)
  if (!meta) return null
  const clone = meta.object3D.clone()
  if (clone.isLine) clone.material = new LineBasicMaterial({ color: colorHex, linewidth: 2 })
  else if (clone.isMesh) clone.material = new MeshBasicMaterial({ color: colorHex, side: DoubleSide })
  return clone
}

function disposeMaterials(object3D) {
  object3D.traverse((child) => child.material?.dispose?.())
}

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
    viewer.IFC.setWasmPath(`${import.meta.env.BASE_URL}ifc-wasm/`)
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
      disposeMaterials(ghost)
      const entry = modelsRef.current[discipline]
      if (entry) getObject3D(entry).visible = visibilityRef.current[discipline] ?? true
    })
    fadedMeshesRef.current = {}

    highlightMeshesRef.current.forEach((object3D) => {
      scene.remove(object3D)
      disposeMaterials(object3D)
    })
    highlightMeshesRef.current = []
  }

  useImperativeHandle(ref, () => ({
    async processFiles(files) {
      const viewer = viewerRef.current
      if (!viewer) return { conflicts: [], totalElements: 0, skippedDisciplines: [] }

      clearHighlight()
      setFocusedConflictId(null)

      Object.values(modelsRef.current).forEach((entry) => {
        if (!entry) return
        if (entry.kind === 'ifc') viewer.context.scene.removeModel(entry.model)
        else viewer.context.getScene().remove(entry.group)
      })
      modelsRef.current = {}

      const entries = Object.entries(files).filter(([, file]) => Boolean(file))
      const skippedDisciplines = []

      for (const [discipline, file] of entries) {
        if (!isViewableFile(file.name)) {
          skippedDisciplines.push(discipline)
          continue
        }

        const color = DISCIPLINE_VIEWER_COLORS[discipline]?.hex ?? 0xffffff

        try {
          if (file.name.toLowerCase().endsWith('.dxf')) {
            const dxfEntry = await loadDxfFile(file, color)
            viewer.context.getScene().add(dxfEntry.group)
            modelsRef.current[discipline] = { kind: 'dxf', ...dxfEntry }
          } else {
            const model = await viewer.IFC.loadIfc(file, false)
            const materials = Array.isArray(model.material) ? model.material : [model.material]
            materials.forEach((mat) => mat?.color?.set(color))
            modelsRef.current[discipline] = { kind: 'ifc', model }
          }
        } catch {
          skippedDisciplines.push(discipline)
        }
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
        Object.entries(modelsRef.current).map(([discipline, entry]) => [
          discipline,
          entry.kind === 'ifc' ? extractElementBoxes(entry.model) : extractDxfElementBoxes(entry),
        ]),
      )
      const collisions = detectCollisions(elementsByDiscipline)
      const totalElements = Object.values(elementsByDiscipline).reduce((sum, arr) => sum + arr.length, 0)

      const nameCache = new Map()
      const resolveName = async (discipline, expressID) => {
        const cacheKey = `${discipline}:${expressID}`
        if (nameCache.has(cacheKey)) return nameCache.get(cacheKey)

        const entry = modelsRef.current[discipline]
        let name = `Elemento #${expressID}`
        if (entry?.kind === 'ifc') {
          try {
            const props = await viewer.IFC.getProperties(entry.model.modelID, expressID, false)
            if (props?.Name?.value) name = props.Name.value
          } catch {
            // keep fallback name
          }
        } else if (entry?.kind === 'dxf') {
          const meta = entry.elements.get(expressID)
          if (meta) name = `${meta.type}${meta.layer ? ` (${meta.layer})` : ''}`
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

      return { conflicts, totalElements, skippedDisciplines }
    },

    focusConflict(conflict) {
      const viewer = viewerRef.current
      const entryA = modelsRef.current[conflict.disciplineA]
      const entryB = modelsRef.current[conflict.disciplineB]
      if (!viewer || !entryA || !entryB) return

      clearHighlight()

      const scene = viewer.context.getScene()
      const ifcManager = viewer.IFC.loader.ifcManager

      Object.entries(modelsRef.current).forEach(([discipline, entry]) => {
        const ghost = buildGhost(entry)
        scene.add(ghost)
        fadedMeshesRef.current[discipline] = ghost
        getObject3D(entry).visible = false
      })

      const highlightA = buildHighlight(entryA, conflict.expressIDA, HIGHLIGHT_COLOR_A, 'conflict-element-a', scene, ifcManager)
      const highlightB = buildHighlight(entryB, conflict.expressIDB, HIGHLIGHT_COLOR_B, 'conflict-element-b', scene, ifcManager)
      if (highlightA) scene.add(highlightA)
      if (highlightB) scene.add(highlightB)
      highlightMeshesRef.current = [highlightA, highlightB].filter(Boolean)

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
      const entry = modelsRef.current[discipline]
      if (entry && focusedConflictId === null) getObject3D(entry).visible = next
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
