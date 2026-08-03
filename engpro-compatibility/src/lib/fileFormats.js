// IFC and DXF are actually parsed and rendered by the 3D engine. The rest
// are accepted so a discipline's real project file can be attached, but
// they won't be loaded into the viewer or considered in collision
// detection — their formats are proprietary/binary with no viable
// browser-side open-source parser (see fileFormats notes in the app docs).
export const VIEWABLE_EXTENSIONS = ['.ifc', '.ifczip', '.dxf']

export const ACCEPTED_EXTENSIONS = [
  ...VIEWABLE_EXTENSIONS,
  '.rvt', // Revit — export as IFC from Revit for real 3D support
  '.rfa', // Revit family
  '.dwg', // AutoCAD binary — save/export as .dxf for real 3D support
  '.skp', // SketchUp
  '.nwd', // Navisworks
  '.nwc', // Navisworks cache
  '.pln', // ArchiCAD
  '.pdf', // 2D plans/drawings exported from any of the above
]

export function isViewableFile(fileName) {
  const lower = fileName.toLowerCase()
  return VIEWABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function isAcceptedFile(fileName) {
  const lower = fileName.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
