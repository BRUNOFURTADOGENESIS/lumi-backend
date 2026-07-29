import { useRef, useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Viewer from './components/Viewer'
import ConflictsPanel from './components/ConflictsPanel'
import StatsPanel from './components/StatsPanel'
import AiAnalysisModal from './components/AiAnalysisModal'

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
  const [totalElements, setTotalElements] = useState(0)
  const [hasProcessed, setHasProcessed] = useState(false)
  const [activeConflictId, setActiveConflictId] = useState(null)
  const [aiConflict, setAiConflict] = useState(null)
  const viewerRef = useRef(null)

  const resetResults = () => {
    setConflicts([])
    setTotalElements(0)
    setHasProcessed(false)
    setActiveConflictId(null)
  }

  const handleSelect = (discipline, file) => {
    setFiles((prev) => ({ ...prev, [discipline]: file }))
    resetResults()
  }

  const handleClear = (discipline) => {
    setFiles((prev) => ({ ...prev, [discipline]: null }))
    resetResults()
  }

  const handleProcess = async () => {
    setIsProcessing(true)
    setActiveConflictId(null)
    try {
      const result = await viewerRef.current?.processFiles(files)
      setConflicts(result?.conflicts ?? [])
      setTotalElements(result?.totalElements ?? 0)
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

  const handleAnalyzeConflict = (conflict) => {
    setAiConflict(conflict)
  }

  const totalDisciplines = Object.values(files).filter(Boolean).length

  return (
    <div className="flex min-h-screen flex-col bg-eng-bg">
      <Header />
      <StatsPanel
        totalElements={totalElements}
        totalDisciplines={totalDisciplines}
        conflicts={conflicts}
        hasProcessed={hasProcessed}
      />
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
          onAnalyzeConflict={handleAnalyzeConflict}
        />
      </div>

      <AiAnalysisModal conflict={aiConflict} onClose={() => setAiConflict(null)} />
    </div>
  )
}

export default App
