'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface FilterOption {
  value: string
  label: string
}

// 'all' is a distinct sentinel from "every option happens to be in the set" —
// it means "no explicit selection, follow the data". URL writeback strips the
// param entirely when state is 'all', so a shared link defaults to all-on.
export type FilterSelection = 'all' | ReadonlySet<string>

interface SingleFilterProps {
  label: string
  options: FilterOption[]
  selection: FilterSelection
  onChange: (next: FilterSelection) => void
}

function SingleFilter({ label, options, selection, onChange }: SingleFilterProps): JSX.Element {
  const t = useTranslations('stockMovements.filters')
  const isAll = selection === 'all'
  // Label rules (Cycle 3-A R2): only the explicit `'all'` sentinel renders as
  // "Alle". A concrete `Set` — even one whose size happens to equal the option
  // count — renders the names so deep-linked operators see what's filtered.
  let summary: string
  if (isAll) {
    summary = `${label}: ${t('all')}`
  } else {
    const labels = options
      .filter((o) => selection.has(o.value))
      .map((o) => o.label)
    if (labels.length >= 1 && labels.length <= 3) {
      summary = `${label}: ${labels.join(', ')}`
    } else {
      summary = `${label}: ${t('selectedCount', { count: selection.size })}`
    }
  }

  const isOptionChecked = (value: string): boolean =>
    selection === 'all' || selection.has(value)

  const handleToggle = (value: string, checked: boolean): void => {
    const current: Set<string> =
      selection === 'all'
        ? new Set(options.map((o) => o.value))
        : new Set(selection)
    if (checked) current.add(value)
    else current.delete(value)
    if (current.size === options.length) {
      onChange('all')
      return
    }
    onChange(current)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <span>{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem] max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{t('noOptions')}</div>
        ) : (
          options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={isOptionChecked(opt.value)}
              onCheckedChange={(checked) => handleToggle(opt.value, Boolean(checked))}
              onSelect={(event) => event.preventDefault()}
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
        {options.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1 text-xs">
              <button
                type="button"
                className="text-foreground hover:underline"
                onClick={() => onChange('all')}
              >
                {t('selectAll')}
              </button>
              <button
                type="button"
                className="text-foreground hover:underline"
                onClick={() => onChange(new Set())}
              >
                {t('clearAll')}
              </button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface MovementFiltersProps {
  locationOptions: FilterOption[]
  storageLocationOptions: FilterOption[]
  stockTypeOptions: FilterOption[]
  selectedLocations: FilterSelection
  selectedStorageLocations: FilterSelection
  selectedStockTypes: FilterSelection
  onLocationsChange: (next: FilterSelection) => void
  onStorageLocationsChange: (next: FilterSelection) => void
  onStockTypesChange: (next: FilterSelection) => void
}

export function MovementFilters({
  locationOptions,
  storageLocationOptions,
  stockTypeOptions,
  selectedLocations,
  selectedStorageLocations,
  selectedStockTypes,
  onLocationsChange,
  onStorageLocationsChange,
  onStockTypesChange,
}: MovementFiltersProps): JSX.Element {
  const t = useTranslations('stockMovements.filters')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SingleFilter
        label={t('locationLabel')}
        options={locationOptions}
        selection={selectedLocations}
        onChange={onLocationsChange}
      />
      <SingleFilter
        label={t('storageLocationLabel')}
        options={storageLocationOptions}
        selection={selectedStorageLocations}
        onChange={onStorageLocationsChange}
      />
      <SingleFilter
        label={t('stockTypeLabel')}
        options={stockTypeOptions}
        selection={selectedStockTypes}
        onChange={onStockTypesChange}
      />
    </div>
  )
}

export function selectionsEqual(a: FilterSelection, b: FilterSelection): boolean {
  if (a === 'all' && b === 'all') return true
  if (a === 'all' || b === 'all') return false
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
