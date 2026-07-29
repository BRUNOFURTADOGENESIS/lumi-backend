import { Box3, Vector3 } from 'three'

export function extractElementBoxes(model) {
  const geometry = model.geometry
  const position = geometry?.attributes?.position
  const expressIDAttr = geometry?.attributes?.expressID
  if (!position || !expressIDAttr) return []

  model.updateMatrixWorld(true)
  const matrixWorld = model.matrixWorld

  const boxesById = new Map()
  const vertex = new Vector3()

  for (let i = 0; i < position.count; i++) {
    const expressID = expressIDAttr.getX(i)
    vertex.fromBufferAttribute(position, i).applyMatrix4(matrixWorld)

    let box = boxesById.get(expressID)
    if (!box) {
      box = new Box3()
      boxesById.set(expressID, box)
    }
    box.expandByPoint(vertex)
  }

  return Array.from(boxesById.entries()).map(([expressID, box]) => ({ expressID, box }))
}

function boxVolume(box) {
  const size = new Vector3()
  box.getSize(size)
  return Math.max(size.x, 0) * Math.max(size.y, 0) * Math.max(size.z, 0)
}

/**
 * Severity is purely geometric: how much of the smaller element's volume
 * is actually swallowed by the overlap region between the two boxes.
 */
export function classifySeverity(elementA, elementB) {
  const overlap = elementA.box.clone().intersect(elementB.box)
  const overlapVolume = boxVolume(overlap)
  const referenceVolume = Math.min(boxVolume(elementA.box), boxVolume(elementB.box)) || 1
  const ratio = overlapVolume / referenceVolume

  if (ratio >= 0.3) return 'Alta'
  if (ratio >= 0.08) return 'Média'
  return 'Baixa'
}

export function detectCollisions(elementsByDiscipline) {
  const disciplines = Object.keys(elementsByDiscipline)
  const collisions = []

  for (let i = 0; i < disciplines.length; i++) {
    for (let j = i + 1; j < disciplines.length; j++) {
      const disciplineA = disciplines[i]
      const disciplineB = disciplines[j]

      for (const elementA of elementsByDiscipline[disciplineA]) {
        for (const elementB of elementsByDiscipline[disciplineB]) {
          if (elementA.box.intersectsBox(elementB.box)) {
            collisions.push({
              disciplineA,
              disciplineB,
              elementA,
              elementB,
              severity: classifySeverity(elementA, elementB),
            })
          }
        }
      }
    }
  }

  return collisions
}
