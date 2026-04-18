'use client'

import { ChevronLeft, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

import { CsvFileDropzone } from './csv-file-dropzone'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import {
  useCreateCsvMapping,
  useCsvPreview,
  useUpdateCsvMapping,
  type ColumnMapping,
  type CsvMappingTemplate,
} from '@/lib/api/use-csv'
import { cn } from '@/lib/utils'

// The product-import dictionary drives the Step-2 mapping UI. Keep in sync
// with the backend PRODUCT_IMPORT_FIELDS constant. `csvOnly` means the user
// can only map the field to a CSV column — a fixed value isn't meaningful
// (every row has its own name/sku/barcode/description). `fieldType` selects
// the editor for the fixed-value mode.
const PRODUCT_FIELDS: Array<{
  key: 'name' | 'sku' | 'barcode' | 'description' | 'unit' | 'batchTracking'
  labelKey: 'productName' | 'sku' | 'barcode' | 'description' | 'unit' | 'batchTracking'
  required: boolean
  csvOnly: boolean
  fieldType: 'text' | 'unit' | 'boolean'
}> = [
  { key: 'name', labelKey: 'productName', required: true, csvOnly: true, fieldType: 'text' },
  { key: 'sku', labelKey: 'sku', required: true, csvOnly: true, fieldType: 'text' },
  { key: 'barcode', labelKey: 'barcode', required: true, csvOnly: true, fieldType: 'text' },
  { key: 'description', labelKey: 'description', required: false, csvOnly: true, fieldType: 'text' },
  { key: 'unit', labelKey: 'unit', required: false, csvOnly: false, fieldType: 'unit' },
  { key: 'batchTracking', labelKey: 'batchTracking', required: false, csvOnly: false, fieldType: 'boolean' },
]

const UNIT_KEYS = ['piece', 'kg', 'liter', 'box', 'pallet'] as const

const DEFAULT_ENCODING = 'utf-8'

interface FieldConfig {
  mode: 'csv' | 'fixed'
  csvColumn: string | null
  fixedValue: string
}

// Sniff the delimiter from the first ~2 KB of a dropped file. We pick the
// character with the highest count among ','/';'/'\t'. On ties or no matches
// we fall back to comma, which is the most common CSV delimiter.
function detectDelimiter(text: string): string {
  const sample = text.slice(0, 2000)
  const counts: Array<[string, number]> = [
    [',', (sample.match(/,/g) ?? []).length],
    [';', (sample.match(/;/g) ?? []).length],
    ['\t', (sample.match(/\t/g) ?? []).length],
  ]
  counts.sort((a, b) => b[1] - a[1])
  const top = counts[0]
  if (!top || top[1] === 0) return ','
  return top[0]
}

function displayDelimiter(d: string): string {
  if (d === '\t') return 'Tab'
  return d
}

interface MappingTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: CsvMappingTemplate | null
  onSaved?: (template: CsvMappingTemplate) => void
}

export function MappingTemplateDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: MappingTemplateDialogProps): JSX.Element {
  const t = useTranslations('csv.templates.dialog')
  const tFields = useTranslations('csv.templates.fields')
  const tCommon = useTranslations('common')

  const isEdit = template !== null
  const preview = useCsvPreview()
  const create = useCreateCsvMapping()
  const update = useUpdateCsvMapping()

  // Step 1 state
  const [name, setName] = useState('')
  const [delimiter, setDelimiter] = useState<string>(',')
  const [encoding, setEncoding] = useState<string>(DEFAULT_ENCODING)
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [sampleRows, setSampleRows] = useState<string[][]>([])
  const [detectedDelimiter, setDetectedDelimiter] = useState<string | null>(null)

  // Step 2 state (field config keyed by product field)
  const [fields, setFields] = useState<Record<string, FieldConfig>>(() =>
    Object.fromEntries(
      PRODUCT_FIELDS.map((f) => [
        f.key,
        { mode: 'csv' as const, csvColumn: null, fixedValue: '' },
      ]),
    ),
  )

  const [step, setStep] = useState<1 | 2>(1)

  useEffect(() => {
    if (!open) return
    if (template) {
      // Re-hydrate from an existing template for edit. If the template was
      // saved with a sample-row snapshot, the preview is immediately
      // available; otherwise the user has to re-upload a CSV.
      setName(template.name)
      setDelimiter(template.delimiter)
      setEncoding(template.encoding || DEFAULT_ENCODING)
      setHasHeaderRow(template.hasHeaderRow)
      if (template.sampleData) {
        setHeaders(template.sampleData.headers)
        setSampleRows(template.sampleData.rows)
      } else {
        setHeaders(
          template.columnMappings
            .map((m) => m.csvColumn)
            .filter((c): c is string => typeof c === 'string'),
        )
        setSampleRows([])
      }
      setDetectedDelimiter(null)
      const next: Record<string, FieldConfig> = {}
      for (const f of PRODUCT_FIELDS) {
        const mapping = template.columnMappings.find((m) => m.field === f.key)
        const defaultValue =
          mapping?.defaultValue ?? template.defaultValues[f.key] ?? ''
        if (mapping?.csvColumn) {
          next[f.key] = { mode: 'csv', csvColumn: mapping.csvColumn, fixedValue: defaultValue }
        } else if (defaultValue && !f.csvOnly) {
          next[f.key] = { mode: 'fixed', csvColumn: null, fixedValue: defaultValue }
        } else {
          next[f.key] = { mode: 'csv', csvColumn: null, fixedValue: '' }
        }
      }
      setFields(next)
      setStep(2)
    } else {
      setName('')
      setDelimiter(',')
      setEncoding(DEFAULT_ENCODING)
      setHasHeaderRow(true)
      setFile(null)
      setHeaders([])
      setSampleRows([])
      setDetectedDelimiter(null)
      setFields(
        Object.fromEntries(
          PRODUCT_FIELDS.map((f) => [
            f.key,
            { mode: 'csv' as const, csvColumn: null, fixedValue: '' },
          ]),
        ),
      )
      setStep(1)
    }
  }, [open, template])

  // `runPreview` captures current state; kept in a ref so the effects
  // below don't need to depend on it (and don't need an eslint-disable for
  // exhaustive-deps, which crashes the react-hooks plugin on ESLint 9).
  const runPreviewRef = useRef<(overrides?: { delimiter?: string }) => Promise<void>>(
    async () => {
      /* populated on each render */
    },
  )
  runPreviewRef.current = async (overrides) => {
    if (!file) return
    try {
      const data = await preview.mutateAsync({
        file,
        delimiter: overrides?.delimiter ?? delimiter,
        hasHeaderRow,
        encoding,
      })
      setHeaders(data.headers)
      setSampleRows(data.sampleRows)
    } catch (err) {
      toast({
        title: t('previewFailed'),
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    }
  }

  // When a new file is dropped, sniff the delimiter from a sample and run
  // the first preview. The delimiter is passed explicitly because it isn't
  // yet in state at this point in the tick.
  useEffect(() => {
    if (!file || step !== 1) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = typeof e.target?.result === 'string' ? e.target.result : ''
      const detected = detectDelimiter(text)
      setDelimiter(detected)
      setDetectedDelimiter(detected)
      void runPreviewRef.current({ delimiter: detected })
    }
    reader.onerror = () => {
      void runPreviewRef.current()
    }
    reader.readAsText(file, 'utf-8')
  }, [file, step])

  // User-driven delimiter / header / encoding changes re-run the preview,
  // but only after the first preview has populated headers.
  useEffect(() => {
    if (!file || headers.length === 0) return
    void runPreviewRef.current()
  }, [delimiter, hasHeaderRow, encoding, file, headers.length])

  function canProceedToStep2(): boolean {
    return name.trim().length > 0 && headers.length > 0
  }

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {}
    for (const f of PRODUCT_FIELDS) {
      if (!f.required) continue
      const cfg = fields[f.key]
      if (!cfg) continue
      const ok = f.csvOnly
        ? Boolean(cfg.csvColumn)
        : (cfg.mode === 'csv' && cfg.csvColumn) ||
          (cfg.mode === 'fixed' && cfg.fixedValue.trim().length > 0)
      if (!ok) errors[f.key] = t('requiredField')
    }
    return errors
  }, [fields, t])

  const canSave = Object.keys(validationErrors).length === 0

  function setFieldMode(key: string, mode: 'csv' | 'fixed'): void {
    setFields((prev) => {
      const current = prev[key] ?? { mode: 'csv', csvColumn: null, fixedValue: '' }
      return { ...prev, [key]: { ...current, mode } }
    })
  }

  function setFieldCsvColumn(key: string, column: string | null): void {
    setFields((prev) => {
      const current = prev[key] ?? { mode: 'csv', csvColumn: null, fixedValue: '' }
      return { ...prev, [key]: { ...current, csvColumn: column } }
    })
  }

  function setFieldFixedValue(key: string, value: string): void {
    setFields((prev) => {
      const current = prev[key] ?? { mode: 'fixed', csvColumn: null, fixedValue: '' }
      return { ...prev, [key]: { ...current, fixedValue: value } }
    })
  }

  function buildMappings(): { columnMappings: ColumnMapping[]; defaultValues: Record<string, string> } {
    const columnMappings: ColumnMapping[] = PRODUCT_FIELDS.map((f) => {
      const cfg = fields[f.key] ?? { mode: 'csv', csvColumn: null, fixedValue: '' }
      const effectiveMode = f.csvOnly ? 'csv' : cfg.mode
      const base: ColumnMapping = {
        field: f.key,
        required: f.required,
        csvColumn: effectiveMode === 'csv' ? cfg.csvColumn : null,
      }
      if (effectiveMode === 'fixed' && cfg.fixedValue.trim()) {
        base.defaultValue = cfg.fixedValue.trim()
      }
      return base
    })
    const defaultValues: Record<string, string> = {}
    for (const f of PRODUCT_FIELDS) {
      if (f.csvOnly) continue
      const cfg = fields[f.key]
      if (cfg?.mode === 'fixed' && cfg.fixedValue.trim()) {
        defaultValues[f.key] = cfg.fixedValue.trim()
      }
    }
    return { columnMappings, defaultValues }
  }

  async function handleSave(): Promise<void> {
    if (!canSave) return
    const { columnMappings, defaultValues } = buildMappings()
    // Capture only when this session has fresh preview data — otherwise an
    // edit-without-reupload would wipe an existing snapshot.
    const sampleData =
      headers.length > 0 && sampleRows.length > 0
        ? { headers, rows: sampleRows.slice(0, 5) }
        : undefined
    try {
      if (isEdit && template) {
        const saved = await update.mutateAsync({
          id: template.id,
          name: name.trim(),
          delimiter,
          encoding,
          hasHeaderRow,
          columnMappings,
          defaultValues,
          ...(sampleData ? { sampleData } : {}),
        })
        toast({ title: t('saved') })
        onSaved?.(saved)
      } else {
        const saved = await create.mutateAsync({
          name: name.trim(),
          direction: 'import',
          resourceType: 'products',
          delimiter,
          encoding,
          hasHeaderRow,
          columnMappings,
          defaultValues,
          ...(sampleData ? { sampleData } : {}),
        })
        toast({ title: t('created') })
        onSaved?.(saved)
      }
      onOpenChange(false)
    } catch (err) {
      toast({
        title: t('saveFailed'),
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    }
  }

  const isSaving = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs flex-shrink-0">
          <StepBadge active={step === 1} done={step > 1} index={1} label={t('step1')} />
          <div className="flex-1 h-px bg-border" />
          <StepBadge active={step === 2} done={false} index={2} label={t('step2')} />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-1 py-1">
        {step === 1 ? (
          <Step1
            name={name}
            onNameChange={setName}
            delimiter={delimiter}
            onDelimiterChange={setDelimiter}
            detectedDelimiter={detectedDelimiter}
            encoding={encoding}
            onEncodingChange={setEncoding}
            hasHeaderRow={hasHeaderRow}
            onHasHeaderRowChange={setHasHeaderRow}
            file={file}
            onFileChange={setFile}
            headers={headers}
            sampleRows={sampleRows}
            isPreviewing={preview.isPending}
          />
        ) : (
          <Step2
            fields={fields}
            headers={headers}
            sampleRows={sampleRows}
            onSetMode={setFieldMode}
            onSetCsvColumn={setFieldCsvColumn}
            onSetFixedValue={setFieldFixedValue}
            validationErrors={validationErrors}
            tFields={tFields}
          />
        )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {step === 2 && !isEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStep(1)
              }}
              disabled={isSaving}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              {t('back')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
              }}
              disabled={isSaving}
            >
              {tCommon('cancel')}
            </Button>
          )}
          {step === 1 ? (
            <Button
              type="button"
              onClick={() => {
                setStep(2)
              }}
              disabled={!canProceedToStep2()}
            >
              {t('next')}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                void handleSave()
              }}
              disabled={!canSave || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                t('save')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepBadge({
  active,
  done,
  index,
  label,
}: {
  active: boolean
  done: boolean
  index: number
  label: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
        active
          ? 'bg-accent text-foreground font-medium'
          : done
            ? 'bg-green-100 text-green-700'
            : 'bg-muted text-muted-foreground',
      )}
    >
      <span className="tabular-nums">{index}.</span>
      <span>{label}</span>
    </div>
  )
}

function Step1({
  name,
  onNameChange,
  delimiter,
  onDelimiterChange,
  detectedDelimiter,
  encoding,
  onEncodingChange,
  hasHeaderRow,
  onHasHeaderRowChange,
  file,
  onFileChange,
  headers,
  sampleRows,
  isPreviewing,
}: {
  name: string
  onNameChange: (v: string) => void
  delimiter: string
  onDelimiterChange: (v: string) => void
  detectedDelimiter: string | null
  encoding: string
  onEncodingChange: (v: string) => void
  hasHeaderRow: boolean
  onHasHeaderRowChange: (v: boolean) => void
  file: File | null
  onFileChange: (f: File | null) => void
  headers: string[]
  sampleRows: string[][]
  isPreviewing: boolean
}): JSX.Element {
  const t = useTranslations('csv.templates.dialog')
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="tpl-name" className="mb-1 block">
          {t('nameLabel')} <span className="text-red-500">*</span>
        </Label>
        <Input
          id="tpl-name"
          value={name}
          onChange={(e) => {
            onNameChange(e.target.value)
          }}
          placeholder="z. B. Xentral Bestandsexport"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-1 block">{t('delimiterLabel')}</Label>
          <div className="flex gap-2">
            {[
              { value: ',', label: ',' },
              { value: ';', label: ';' },
              { value: '\t', label: 'Tab' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onDelimiterChange(opt.value)
                }}
                className={cn(
                  'h-8 px-3 rounded-md text-sm border transition-colors',
                  delimiter === opt.value
                    ? 'bg-accent border-foreground/20 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {detectedDelimiter ? (
            <p className="text-xs text-muted-foreground mt-1">
              {t('delimiterDetected', { delimiter: displayDelimiter(detectedDelimiter) })}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between pt-6">
          <Label className="mb-0">{t('hasHeaderLabel')}</Label>
          <Switch checked={hasHeaderRow} onCheckedChange={onHasHeaderRowChange} />
        </div>
      </div>

      <div>
        <Label className="mb-1 block">{t('encodingLabel')}</Label>
        <Select value={encoding} onValueChange={onEncodingChange}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="utf-8">UTF-8</SelectItem>
            <SelectItem value="iso-8859-1">ISO-8859-1 / Latin-1</SelectItem>
            <SelectItem value="windows-1252">Windows-1252</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-1 block">{t('uploadLabel')}</Label>
        <CsvFileDropzone
          file={file}
          onChange={onFileChange}
          placeholder={t('uploadPlaceholder')}
          hint={t('uploadHint')}
          clearLabel={t('clearFile')}
        />
      </div>

      {isPreviewing ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('previewing')}
        </div>
      ) : null}

      {headers.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t('detectedHeaders')} ({headers.length})
          </p>
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {headers.map((h, idx) => (
                    <th
                      key={idx}
                      className="text-left px-3 py-2 font-medium text-foreground whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-border last:border-b-0">
                    {headers.map((_, cIdx) => (
                      <td key={cIdx} className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                        {row[cIdx] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Step2({
  fields,
  headers,
  sampleRows,
  onSetMode,
  onSetCsvColumn,
  onSetFixedValue,
  validationErrors,
  tFields,
}: {
  fields: Record<string, FieldConfig>
  headers: string[]
  sampleRows: string[][]
  onSetMode: (key: string, mode: 'csv' | 'fixed') => void
  onSetCsvColumn: (key: string, column: string | null) => void
  onSetFixedValue: (key: string, value: string) => void
  validationErrors: Record<string, string>
  tFields: (key: string) => string
}): JSX.Element {
  const t = useTranslations('csv.templates.dialog')

  function applyFieldToRow(row: string[], key: string): string {
    const cfg = fields[key]
    if (!cfg) return ''
    if (cfg.mode === 'csv') {
      if (!cfg.csvColumn) return ''
      const idx = headers.indexOf(cfg.csvColumn)
      return idx >= 0 ? (row[idx] ?? '') : ''
    }
    return cfg.fixedValue
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-3">
        {PRODUCT_FIELDS.map((f) => {
          const cfg = fields[f.key] ?? { mode: 'csv' as const, csvColumn: null, fixedValue: '' }
          const effectiveMode = f.csvOnly ? 'csv' : cfg.mode
          const error = validationErrors[f.key]
          return (
            <div key={f.key}>
              <Label className="mb-1 block">
                {tFields(f.labelKey)}
                {f.required ? <span className="text-red-500 ml-0.5">*</span> : null}
              </Label>
              <div className="flex items-stretch gap-2">
                {!f.csvOnly && (
                  <div className="flex rounded-md overflow-hidden border border-border text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        onSetMode(f.key, 'csv')
                      }}
                      className={cn(
                        'px-2 h-8 transition-colors',
                        cfg.mode === 'csv'
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {t('csvColumnLabel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetMode(f.key, 'fixed')
                      }}
                      className={cn(
                        'px-2 h-8 transition-colors',
                        cfg.mode === 'fixed'
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {t('fixedValueLabel')}
                    </button>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {effectiveMode === 'csv' ? (
                    <Select
                      value={cfg.csvColumn ?? ''}
                      onValueChange={(v) => {
                        onSetCsvColumn(f.key, v || null)
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder={t('csvColumnPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {headers.map((h, idx) => (
                          <SelectItem key={idx} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.fieldType === 'boolean' ? (
                    <Select
                      value={cfg.fixedValue || ''}
                      onValueChange={(v) => {
                        onSetFixedValue(f.key, v)
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder={t('booleanSelectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">{t('batchTrackingTrue')}</SelectItem>
                        <SelectItem value="false">{t('batchTrackingFalse')}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : f.fieldType === 'unit' ? (
                    <UnitSelect
                      value={cfg.fixedValue}
                      onChange={(v) => {
                        onSetFixedValue(f.key, v)
                      }}
                    />
                  ) : (
                    <Input
                      className="h-8"
                      value={cfg.fixedValue}
                      onChange={(e) => {
                        onSetFixedValue(f.key, e.target.value)
                      }}
                      placeholder={t('fixedValuePlaceholder')}
                    />
                  )}
                </div>
              </div>
              {error ? (
                <p className="text-xs text-red-600 mt-1">{error}</p>
              ) : null}
            </div>
          )
        })}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          {t('preview')}
        </p>
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {PRODUCT_FIELDS.map((f) => (
                  <th
                    key={f.key}
                    className="text-left px-3 py-2 font-medium text-foreground whitespace-nowrap"
                  >
                    {tFields(f.labelKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={PRODUCT_FIELDS.length}
                    className="px-3 py-6 text-center text-muted-foreground text-xs"
                  >
                    {t('previewEmpty')}
                  </td>
                </tr>
              ) : (
                sampleRows.slice(0, 3).map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-border last:border-b-0">
                    {PRODUCT_FIELDS.map((f) => (
                      <td
                        key={f.key}
                        className="px-3 py-1.5 text-muted-foreground whitespace-nowrap"
                      >
                        {applyFieldToRow(row, f.key) || (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function UnitSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  const tUnits = useTranslations('products.units')
  const tDialog = useTranslations('csv.templates.dialog')
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="h-8">
        <SelectValue placeholder={tDialog('unitSelectPlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        {UNIT_KEYS.map((u) => (
          <SelectItem key={u} value={u}>
            {tUnits(u)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
