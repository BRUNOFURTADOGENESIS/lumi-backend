import { useState } from 'react'
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

  const handleSelect = (discipline, file) => {
    setFiles((prev) => ({ ...prev, [discipline]: file }))
  }

  const handleClear = (discipline) => {
    setFiles((prev) => ({ ...prev, [discipline]: null }))
  }

  const handleProcess = () => {
    setIsProcessing(true)
    setTimeout(() => setIsProcessing(false), 1400)
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
        <Viewer />
        <ConflictsPanel />
      </div>
    </div>
  )
}

export default App
