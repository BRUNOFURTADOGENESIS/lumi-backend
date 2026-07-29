import { useRef, useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Viewer from './components/Viewer'
import ConflictsPanel from './components/ConflictsPanel'

const EMPTY_FILES = {
  arquitetura: null,
  estrutural: null,
  hidraulico: null,
  eletrica: null,
}

function App() {
  const [files, setFiles] = useState(EMPTY_FILES)
  const [isProcessing, setIsProcessing] = useState(false)
  const [conflicts, setConflicts] = useState([])
  const [hasProcessed, setHasProcessed] = useState(false)
  const [activeConflictId, setActiveConflictId] = useState(null)
  const viewerRef = useRef(null)

  const handleSelect = (discipline, file) => {
    setFiles((prev) => ({ ...prev, [discipline]: file }))
    setConflicts([])
    setHasProcessed(false)
    setActiveConflictId(null)
  }

  const handleClear = (discipline) => {
    setFiles((prev) => ({ ...prev, [discipline]: null }))
    setConflicts([])
    setHasProcessed(false)
    setActiveConflictId(null)
  }

  const handleProcess = async () => {
    setIsProcessing(true)
    setActiveConflictId(null)
    try {
      const result = await viewerRef.current?.processFiles(files)
      setConflicts(result ?? [])
      setHasProcessed(true)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSelectConflict = (conflict) => {
    viewerRef.current?.focusConflict(conflict)
    setActiveConflictId(conflict.id)
  }

  const handleClearFocus = () => {
    setActiveConflictId(null)
  }

  return (
    <div className="flex min-h-screen flex-col bg-eng-bg">
      <Header />
      <div className="flex flex-1 flex-col lg:flex-row">
        <Sidebar
          files={files}
          onSelect={handleSelect}
          onClear={handleClear}
          onProcess={handleProcess}
          isProcessing={isProcessing}
        />
        <Viewer ref={viewerRef} onClearFocus={handleClearFocus} />
        <ConflictsPanel
          conflicts={conflicts}
          hasProcessed={hasProcessed}
          activeConflictId={activeConflictId}
          onSelectConflict={handleSelectConflict}
        />
      </div>
    </div>
  )
}

export default App
