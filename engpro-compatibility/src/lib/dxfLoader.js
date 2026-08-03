import DxfParser from 'dxf-parser'
import {
  Box3,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three'

const ARC_SEGMENTS = 32

function toVector3(point) {
  return new Vector3(point?.x ?? 0, point?.y ?? 0, point?.z ?? 0)
}

function arcPoints(center, radius, startAngle, endAngle) {
  const points = []
  let end = endAngle
  if (end < startAngle) end += Math.PI * 2
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const angle = startAngle + ((end - startAngle) * i) / ARC_SEGMENTS
    points.push(new Vector3(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, center.z))
  }
  return points
}

function entityToObject3D(entity, lineMaterial, faceMaterial) {
  switch (entity.type) {
    case 'LINE': {
      const points = (entity.vertices || []).map(toVector3)
      if (points.length < 2) return null
      return new Line(new BufferGeometry().setFromPoints(points), lineMaterial)
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const points = (entity.vertices || []).map(toVector3)
      if (points.length < 2) return null
      if (entity.shape) points.push(points[0].clone())
      return new Line(new BufferGeometry().setFromPoints(points), lineMaterial)
    }
    case 'CIRCLE': {
      const center = toVector3(entity.center)
      const points = arcPoints(center, entity.radius ?? 1, 0, Math.PI * 2)
      return new Line(new BufferGeometry().setFromPoints(points), lineMaterial)
    }
    case 'ARC': {
      const center = toVector3(entity.center)
      const points = arcPoints(center, entity.radius ?? 1, entity.startAngle ?? 0, entity.endAngle ?? Math.PI * 2)
      return new Line(new BufferGeometry().setFromPoints(points), lineMaterial)
    }
    case 'POINT': {
      const p = toVector3(entity.position)
      return new Line(new BufferGeometry().setFromPoints([p, p]), lineMaterial)
    }
    case '3DFACE': {
      const verts = (entity.vertices || []).map(toVector3)
      if (verts.length < 3) return null
      const positions = []
      for (let i = 1; i < verts.length - 1; i++) {
        positions.push(verts[0].x, verts[0].y, verts[0].z)
        positions.push(verts[i].x, verts[i].y, verts[i].z)
        positions.push(verts[i + 1].x, verts[i + 1].y, verts[i + 1].z)
      }
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
      geometry.computeVertexNormals()
      return new Mesh(geometry, faceMaterial)
    }
    default:
      return null
  }
}

/**
 * Parses a real DXF file and builds a THREE.Group whose children are the
 * actual drawn entities (lines, polylines, circles, arcs, 3D faces), each
 * tagged with a synthetic element id so it can be treated the same way as
 * an IFC element for bounding-box collision detection and highlighting.
 */
export async function loadDxfFile(file, colorHex) {
  const text = await file.text()
  const parser = new DxfParser()
  const dxf = parser.parseSync(text)
  if (!dxf) throw new Error('Não foi possível interpretar o arquivo DXF.')

  const lineMaterial = new LineBasicMaterial({ color: colorHex })
  const faceMaterial = new MeshBasicMaterial({ color: colorHex, side: DoubleSide })

  const group = new Group()
  const elements = new Map()
  let nextId = 1

  for (const entity of dxf.entities ?? []) {
    const object3D = entityToObject3D(entity, lineMaterial, faceMaterial)
    if (!object3D) continue

    const id = nextId++
    object3D.userData.dxfElementId = id
    group.add(object3D)
    elements.set(id, {
      object3D,
      type: entity.type,
      layer: entity.layer,
    })
  }

  return { group, elements, lineMaterial, faceMaterial, entityCount: dxf.entities?.length ?? 0 }
}

export function extractDxfElementBoxes(dxfEntry) {
  const boxes = []
  dxfEntry.group.updateMatrixWorld(true)
  for (const [id, { object3D }] of dxfEntry.elements) {
    const box = new Box3().setFromObject(object3D)
    if (!box.isEmpty()) boxes.push({ expressID: id, box })
  }
  return boxes
}
