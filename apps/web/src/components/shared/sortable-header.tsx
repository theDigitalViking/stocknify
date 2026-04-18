'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export type SortDir = 'asc' | 'desc' | null

interface SortableHeaderProps {
  label: string
  field: string
  currentField: string | null
  currentDir: SortDir
  onSort: (field: string | null, dir: SortDir) => void
}

export function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
}: SortableHeaderProps): JSX.Element {
  const isActive = currentField === field

  function handleClick(): void {
    if (!isActive) {
      onSort(field, 'asc')
      return
    }
    if (currentDir === 'asc') {
      onSort(field, 'desc')
      return
    }
    onSort(null, null)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors',
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span>{label}</span>
      {!isActive ? <ArrowUpDown className="h-3 w-3 opacity-40" /> : null}
      {isActive && currentDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : null}
      {isActive && currentDir === 'desc' ? <ArrowDown className="h-3 w-3" /> : null}
    </button>
  )
}
