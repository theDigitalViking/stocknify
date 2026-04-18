'use client'

import { ChevronLeft, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

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
// with the backend PRODUCT_IMPORT_FIELDS constant.
const PRODUCT_FIELDS: Array<{
  key: 'name' | 'sku' | 'barcode' | 'description' | 'category' | 'unit'
  labelKey: 'productName' | 'sku' | 'barcode' | 'description' | 'category' | 'unit'
  required: boolean
}> = [
  { key: 'name', labelKey: 'productName', required: true },
  { key: 'sku', labelKey: 'sku', required: true },
  { key: 'barcode', labelKey: 'barcode', required: false },
  { key: 'description', labelKey: 'description', required: false },
  { key: 'category', labelKey: 'category', required: false },
  { key: 'unit', labelKey: 'unit', required: false },
]

interface FieldConfig {
  mode: 'csv' | 'fixed'
  csvColumn: string | null
  fixedValue: string
}

interface MappingTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: CsvMappingTemplate | null
}

export function MappingTemplateDialog({
  open,
  onOpenChange,
  template,
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
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [sampleRows, setSampleRows] = useState<string[][]>([])

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
      // Re-hydrate from an existing template for edit. The sample-row preview
      // is empty until the user re-uploads a file.
      setName(template.name)
      setDelimiter(template.delimiter)
      setHasHeaderRow(template.hasHeaderRow)
      setHeaders(
        template.columnMappings
          .map((m) => m.csvColumn)
          .filter((c): c is string => typeof c === 'string'),
      )
      setSampleRows([])
      const next: Record<string, FieldConfig> = {}
      for (const f of PRODUCT_FIELDS) {
        const mapping = template.columnMappings.find((m) => m.field === f.key)
        const defaultValue =
          mapping?.defaultValue ?? template.defaultValues[f.key] ?? ''
        if (mapping?.csvColumn) {
          next[f.key] = { mode: 'csv', csvColumn: mapping.csvColumn, fixedValue: defaultValue }
        } else if (defaultValue) {
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
      setHasHeaderRow(true)
      setFile(null)
      setHeaders([])
      setSampleRows([])
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

  async function runPreview(): Promise<void> {
    if (!file) return
    try {
      const data = await preview.mutateAsync({
        file,
        delimiter,
        hasHeaderRow,
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

  function canProceedToStep2(): boolean {
    return name.trim().length > 0 && headers.length > 0
  }

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {}
    for (const f of PRODUCT_FIELDS) {
      if (!f.required) continue
      const cfg = fields[f.key]
      if (!cfg) continue
      const ok =
        (cfg.mode === 'csv' && cfg.csvColumn) ||
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
      const base: ColumnMapping = {
        field: f.key,
        required: f.required,
        csvColumn: cfg.mode === 'csv' ? cfg.csvColumn : null,
      }
      if (cfg.mode === 'fixed' && cfg.fixedValue.trim()) {
        base.defaultValue = cfg.fixedValue.trim()
      }
      return base
    })
    const defaultValues: Record<string, string> = {}
    for (const f of PRODUCT_FIELDS) {
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
    try {
      if (isEdit && template) {
        await update.mutateAsync({
          id: template.id,
          name: name.trim(),
          delimiter,
          hasHeaderRow,
          columnMappings,
          defaultValues,
        })
        toast({ title: t('saved') })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          direction: 'import',
          resourceType: 'products',
          delimiter,
          hasHeaderRow,
          columnMappings,
          defaultValues,
        })
        toast({ title: t('created') })
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs">
          <StepBadge active={step === 1} done={step > 1} index={1} label={t('step1')} />
          <div className="flex-1 h-px bg-border" />
          <StepBadge active={step === 2} done={false} index={2} label={t('step2')} />
        </div>

        {step === 1 ? (
          <Step1
            name={name}
            onNameChange={setName}
            delimiter={delimiter}
            onDelimiterChange={setDelimiter}
            hasHeaderRow={hasHeaderRow}
            onHasHeaderRowChange={setHasHeaderRow}
            file={file}
            onFileChange={setFile}
            headers={headers}
            sampleRows={sampleRows}
            onRunPreview={runPreview}
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

        <DialogFooter>
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
  hasHeaderRow,
  onHasHeaderRowChange,
  file,
  onFileChange,
  headers,
  sampleRows,
  onRunPreview,
  isPreviewing,
}: {
  name: string
  onNameChange: (v: string) => void
  delimiter: string
  onDelimiterChange: (v: string) => void
  hasHeaderRow: boolean
  onHasHeaderRowChange: (v: boolean) => void
  file: File | null
  onFileChange: (f: File | null) => void
  headers: string[]
  sampleRows: string[][]
  onRunPreview: () => Promise<void>
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
        </div>

        <div className="flex items-center justify-between pt-6">
          <Label className="mb-0">{t('hasHeaderLabel')}</Label>
          <Switch checked={hasHeaderRow} onCheckedChange={onHasHeaderRowChange} />
        </div>
      </div>

      <div>
        <Label className="mb-1 block">{t('uploadLabel')}</Label>
        <CsvFileDropzone
          file={file}
          onChange={(f) => {
            onFileChange(f)
            if (f) void onRunPreview()
          }}
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
          const error = validationErrors[f.key]
          return (
            <div key={f.key}>
              <Label className="mb-1 block">
                {tFields(f.labelKey)}
                {f.required ? <span className="text-red-500 ml-0.5">*</span> : null}
              </Label>
              <div className="flex items-stretch gap-2">
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
                <div className="flex-1 min-w-0">
                  {cfg.mode === 'csv' ? (
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
