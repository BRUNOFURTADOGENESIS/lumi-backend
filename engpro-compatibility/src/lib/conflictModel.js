import { Vector3 } from 'three'
import { DISCIPLINE_CONFLICT_LABELS } from './disciplines'

/**
 * Canonical conflict record — the data contract a future AI analysis module
 * would consume. Every field below is plain/serializable except `box`
 * (kept as a THREE.Box3 instance purely so the viewer can re-fit the camera
 * without recomputing it); expressIDA/expressIDB are the raw IFC identifiers
 * the viewer needs to re-select the exact elements for highlighting.
 */
export function buildConflict({ id, collision, elementAName, elementBName }) {
  const { disciplineA, disciplineB, elementA, elementB, severity } = collision
  const box = elementA.box.clone().union(elementB.box)
  const center = box.getCenter(new Vector3())

  return {
    id,
    elementA: elementAName,
    elementB: elementBName,
    disciplineA,
    disciplineB,
    disciplineLabelA: DISCIPLINE_CONFLICT_LABELS[disciplineA] ?? disciplineA,
    disciplineLabelB: DISCIPLINE_CONFLICT_LABELS[disciplineB] ?? disciplineB,
    location: { x: center.x, y: center.y, z: center.z },
    boundingBox: {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    },
    category: 'Interferência Geométrica',
    severity,
    expressIDA: elementA.expressID,
    expressIDB: elementB.expressID,
    box,
  }
}
