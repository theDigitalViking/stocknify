'use client'

import { FileText, Upload, X } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import { cn } from '@/lib/utils'

interface CsvFileDropzoneProps {
  file: File | null
  onChange: (file: File | null) => void
  placeholder: string
  hint: string
  clearLabel: string
}

// Accept .csv, .txt, and common CSV-ish mime types. The server re-validates
// before parsing, so this is purely a UX gate.
const ACCEPT_ATTR = '.csv,.txt,text/csv,application/csv,text/plain'
const ALLOWED_EXTENSIONS = ['csv', 'txt']

export function CsvFileDropzone({
  file,
  onChange,
  placeholder,
  hint,
  clearLabel,
}: CsvFileDropzoneProps): JSX.Element {
  const [isOver, setIsOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function isAllowed(candidate: File): boolean {
    const ext = candidate.name.split('.').pop()?.toLowerCase() ?? ''
    return ALLOWED_EXTENSIONS.includes(ext)
  }

  function handleFiles(files: FileList | null): void {
    const first = files?.[0]
    if (!first) return
    if (!isAllowed(first)) return
    onChange(first)
  }

  function onInput(e: ChangeEvent<HTMLInputElement>): void {
    handleFiles(e.target.files)
    // Reset so re-selecting the same file still triggers change.
    e.target.value = ''
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsOver(false)
    handleFiles(e.dataTransfer.files)
  }

  if (file) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KB
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null)
          }}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
          aria-label={clearLabel}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={() => {
        setIsOver(false)
      }}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-dashed px-6 py-10 text-center cursor-pointer transition-colors',
        isOver
          ? 'border-brand-600 bg-brand-100/40 text-foreground'
          : 'border-border text-muted-foreground hover:border-brand-600 hover:text-foreground',
      )}
    >
      <Upload className="h-5 w-5 mb-2" />
      <p className="text-sm font-medium text-foreground">{placeholder}</p>
      <p className="text-xs mt-1">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        onChange={onInput}
        className="hidden"
      />
    </div>
  )
}
