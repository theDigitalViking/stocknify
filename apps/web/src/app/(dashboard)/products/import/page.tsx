'use client'

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Info,
  Plus,
  Upload,
} from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CsvFileDropzone } from '@/components/csv/csv-file-dropzone'
import { MappingTemplateDialog } from '@/components/csv/mapping-template-dialog'
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
  type CsvImportResult,
} from '@/lib/api/use-csv'
import { cn } from '@/lib/utils'

const DEFAULT_TEMPLATE_VALUE = '__default__'
const NEW_TEMPLATE_VALUE = '__new__'

export default function ProductImportPage(): JSX.Element {
  const t = useTranslations('csv.import')
  const tProducts = useTranslations('products')

  const { data: templates = [] } = useCsvMappings({
    direction: 'import',
    resourceType: 'products',
  })
  const importProducts = useImportProducts()

  const [file, setFile] = useState<File | null>(null)
  const [templateValue, setTemplateValue] = useState<string>(DEFAULT_TEMPLATE_VALUE)
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const [errorsOpen, setErrorsOpen] = useState(false)
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false)

  function handleTemplateChange(value: string): void {
    if (value === NEW_TEMPLATE_VALUE) {
      setCreateTemplateOpen(true)
      return
    }
    setTemplateValue(value)
  }

  async function runImport(dryRun: boolean): Promise<void> {
    if (!file) {
      toast({ title: t('noFile'), variant: 'destructive' })
      return
    }
    try {
      const res = await importProducts.mutateAsync({
        file,
        dryRun,
        ...(templateValue !== DEFAULT_TEMPLATE_VALUE ? { mappingTemplateId: templateValue } : {}),
      })
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
    <div>
      <div className="h-12 border-b border-border px-6 flex items-center gap-2 text-sm">
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {tProducts('title')}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{t('productImportTitle')}</span>
      </div>

      <div className="px-6 py-6">
        <div className="rounded-md border border-border bg-card p-6 max-w-xl">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            {t('productImportTitle')}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('templateLabel')}</label>
              <Select value={templateValue} onValueChange={handleTemplateChange}>
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
                  <SelectItem value={NEW_TEMPLATE_VALUE} className="text-brand-700">
                    <span className="inline-flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      {t('newTemplate')}
                    </span>
                  </SelectItem>
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
                disabled={importProducts.isPending || !file}
              >
                {t('dryRunButton')}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  void runImport(false)
                }}
                disabled={importProducts.isPending || !file}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                {t('importButton')}
              </Button>
            </div>
          </div>
        </div>

        {result ? (
          <div className="mt-6 max-w-xl">
            <ResultCard
              result={result}
              errorsOpen={errorsOpen}
              onToggleErrors={() => {
                setErrorsOpen((v) => !v)
              }}
            />
          </div>
        ) : null}
      </div>

      <MappingTemplateDialog
        open={createTemplateOpen}
        onOpenChange={setCreateTemplateOpen}
        template={null}
        onSaved={(saved) => {
          setTemplateValue(saved.id)
        }}
      />
    </div>
  )
}

function ResultCard({
  result,
  errorsOpen,
  onToggleErrors,
}: {
  result: CsvImportResult
  errorsOpen: boolean
  onToggleErrors: () => void
}): JSX.Element {
  const t = useTranslations('csv.import')
  const hasErrors = result.errors.length > 0
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
            <Metric label={t('created', { count: result.created })} value={result.created} tone="success" />
            <Metric label={t('updated', { count: result.updated })} value={result.updated} tone="info" />
            <Metric label={t('skipped', { count: result.skipped })} value={result.skipped} tone="muted" />
            <Metric
              label={t('errors', { count: result.errors.length })}
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
