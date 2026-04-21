'use client'

import { AlertTriangle, CheckCircle2, ChevronDown, Info, Plus, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { CsvFileDropzone } from './csv-file-dropzone'
import { MappingTemplateDialog } from './mapping-template-dialog'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import {
  useCsvMappings,
  useImportProducts,
  useImportStock,
  type CsvImportResult,
} from '@/lib/api/use-csv'
import { cn } from '@/lib/utils'

const DEFAULT_TEMPLATE_VALUE = '__default__'
const RESOURCE_TYPES: Array<'products' | 'stock'> = ['products', 'stock']

interface CsvImportPanelProps {
  // Locked resource type. When passed, the resource-type toggle is hidden —
  // the caller owns this decision (e.g. /products/import pins 'products').
  // When omitted, the panel renders the switch and defaults to 'products'.
  defaultResourceType?: 'products' | 'stock'
}

export function CsvImportPanel({
  defaultResourceType,
}: CsvImportPanelProps = {}): JSX.Element {
  const t = useTranslations('csv.import')
  const tResources = useTranslations('csv.templates.resourceTypes')

  const isLocked = defaultResourceType !== undefined
  const [resourceType, setResourceType] = useState<'products' | 'stock'>(
    defaultResourceType ?? 'products',
  )
  const { data: templates = [] } = useCsvMappings({
    direction: 'import',
    resourceType,
  })
  const importProducts = useImportProducts()
  const importStock = useImportStock()

  const [file, setFile] = useState<File | null>(null)
  const [templateValue, setTemplateValue] = useState<string>(DEFAULT_TEMPLATE_VALUE)
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const [errorsOpen, setErrorsOpen] = useState(false)
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false)

  // Clear selection when switching resource types — templates from the
  // other resource should not stay selected by stale id.
  function handleResourceChange(next: 'products' | 'stock'): void {
    if (next === resourceType) return
    setResourceType(next)
    setTemplateValue(DEFAULT_TEMPLATE_VALUE)
    setFile(null)
    setResult(null)
  }

  const resourceLabel = useMemo(() => tResources(resourceType), [tResources, resourceType])

  const isPending = importProducts.isPending || importStock.isPending

  async function runImport(dryRun: boolean): Promise<void> {
    if (!file) {
      toast({ title: t('noFile'), variant: 'destructive' })
      return
    }
    try {
      const params = {
        file,
        dryRun,
        ...(templateValue !== DEFAULT_TEMPLATE_VALUE ? { mappingTemplateId: templateValue } : {}),
      }
      const res =
        resourceType === 'stock'
          ? await importStock.mutateAsync(params)
          : await importProducts.mutateAsync(params)
      setResult(res)
      setErrorsOpen(false)
    } catch (err) {
      toast({
        title: t('importFailed'),
        description: err instanceof Error ? err.message : t('importFailedGeneric'),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          {t('titleFor', { resource: resourceLabel })}
        </h2>

        <div className="space-y-4 max-w-xl">
          {!isLocked ? (
            <div>
              <label className="text-sm font-medium mb-1 block">{t('resourceTypeLabel')}</label>
              <div className="flex gap-2">
                {RESOURCE_TYPES.map((rt) => (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => {
                      handleResourceChange(rt)
                    }}
                    className={cn(
                      'h-8 px-3 rounded-md text-sm border transition-colors',
                      resourceType === rt
                        ? 'bg-accent border-foreground/20 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    {tResources(rt)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-sm font-medium mb-1 block">{t('templateLabel')}</label>
            <Select value={templateValue} onValueChange={setTemplateValue}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_TEMPLATE_VALUE}>{t('defaultTemplate')}</SelectItem>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </SelectItem>
                ))}
                <div className="h-px bg-border my-1" />
                <div
                  role="option"
                  tabIndex={0}
                  aria-selected={false}
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-brand-700 hover:bg-accent outline-none"
                  onClick={() => {
                    setCreateTemplateOpen(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setCreateTemplateOpen(true)
                    }
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t('newTemplate')}
                </div>
              </SelectContent>
            </Select>
          </div>

          <CsvFileDropzone
            file={file}
            onChange={setFile}
            placeholder={t('dropzone')}
            hint={t('dropzoneHint')}
            clearLabel={t('clearFile')}
          />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void runImport(true)
              }}
              disabled={isPending || !file}
            >
              {t('dryRunButton')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void runImport(false)
              }}
              disabled={isPending || !file}
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              {t('importButton')}
            </Button>
          </div>
        </div>
      </div>

      {result ? (
        <CsvImportResultCard
          result={result}
          resourceType={resourceType}
          errorsOpen={errorsOpen}
          onToggleErrors={() => {
            setErrorsOpen((v) => !v)
          }}
        />
      ) : null}

      <MappingTemplateDialog
        open={createTemplateOpen}
        onOpenChange={setCreateTemplateOpen}
        template={null}
        resourceType={resourceType}
        onSaved={(saved) => {
          setTemplateValue(saved.id)
          setCreateTemplateOpen(false)
        }}
      />
    </div>
  )
}

function CsvImportResultCard({
  result,
  resourceType,
  errorsOpen,
  onToggleErrors,
}: {
  result: CsvImportResult
  resourceType: 'products' | 'stock'
  errorsOpen: boolean
  onToggleErrors: () => void
}): JSX.Element {
  const t = useTranslations('csv.import')
  const hasErrors = result.errors.length > 0
  // Pick between "Products created" / "Stock levels created" etc. — the
  // `created` and `updated` counts mean different things per resource type,
  // so the label should name the resource explicitly.
  const createdLabel = resourceType === 'stock' ? t('stock.created') : t('products.created')
  const updatedLabel = resourceType === 'stock' ? t('stock.updated') : t('products.updated')
  return (
    <div className="rounded-md border border-border bg-card p-6 space-y-4">
      {result.dryRun ? (
        <div className="flex items-center gap-2 rounded-md bg-amber-100 text-amber-700 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>{t('dryRunBanner')}</span>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        {hasErrors ? (
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{t('resultTitle')}</h3>
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <Metric label={createdLabel} value={result.created} tone="success" />
            <Metric label={updatedLabel} value={result.updated} tone="info" />
            <Metric label={t('skipped')} value={result.skipped} tone="muted" />
            <Metric
              label={t('errors')}
              value={result.errors.length}
              tone={hasErrors ? 'warning' : 'muted'}
            />
          </dl>
        </div>
      </div>

      {hasErrors ? (
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={onToggleErrors}
            className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-brand-700 transition-colors"
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', errorsOpen ? '' : '-rotate-90')}
            />
            {t('showErrors')}
          </button>
          {errorsOpen ? (
            <ul className="mt-3 space-y-1 text-xs">
              {result.errors.map((e, i) => (
                <li
                  key={`${String(e.row)}-${String(i)}`}
                  className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-700"
                >
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    <span className="font-medium">{t('errorRow', { row: e.row })}</span>
                    {e.sku ? <span className="text-red-600"> (SKU: {e.sku})</span> : null}
                    <span className="text-red-700">: {e.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'info' | 'warning' | 'muted'
}): JSX.Element {
  const colour =
    tone === 'success'
      ? 'text-green-700'
      : tone === 'info'
        ? 'text-blue-700'
        : tone === 'warning'
          ? 'text-amber-700'
          : 'text-muted-foreground'
  return (
    <div>
      <dt className={cn('text-xs font-medium uppercase tracking-wide', colour)}>{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
