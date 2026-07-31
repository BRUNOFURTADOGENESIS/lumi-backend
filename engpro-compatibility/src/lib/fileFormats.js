// IFC is the only format the 3D engine can actually parse. The others are
// accepted so a discipline's real project file can be attached, but they
// won't be loaded into the viewer or considered in collision detection.
export const VIEWABLE_EXTENSIONS = ['.ifc', '.ifczip']

export const ACCEPTED_EXTENSIONS = [
  ...VIEWABLE_EXTENSIONS,
  '.rvt', // Revit
  '.rfa', // Revit family
  '.dwg', // AutoCAD
  '.dxf', // AutoCAD exchange
  '.skp', // SketchUp
  '.nwd', // Navisworks
  '.nwc', // Navisworks cache
  '.pln', // ArchiCAD
]

export function isViewableFile(fileName) {
  const lower = fileName.toLowerCase()
  return VIEWABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function isAcceptedFile(fileName) {
  const lower = fileName.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
