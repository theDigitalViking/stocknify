'use client'

import { formatDistanceToNow } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { MappingTemplateDialog } from './mapping-template-dialog'

import { DataTable, type ColumnDef } from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import {
  useCsvMappings,
  useDeleteCsvMapping,
  type CsvMappingTemplate,
} from '@/lib/api/use-csv'

export function MappingTemplatesPanel(): JSX.Element {
  const t = useTranslations('csv.templates')
  const locale = useLocale()
  const dateLocale = locale === 'de' ? deLocale : undefined

  const { data: templates = [], isLoading } = useCsvMappings()
  const deleteMapping = useDeleteCsvMapping()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CsvMappingTemplate | null>(null)

  function displayDelimiter(d: string): string {
    if (d === '\t') return 'Tab'
    return d
  }

  async function handleDelete(row: CsvMappingTemplate): Promise<void> {
    if (!window.confirm(t('deleteConfirm', { name: row.name }))) return
    try {
      await deleteMapping.mutateAsync(row.id)
      toast({ title: t('deleted') })
    } catch (err) {
      toast({
        title: t('deleteFailed'),
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    }
  }

  const columns: ColumnDef<CsvMappingTemplate>[] = [
    { header: t('columns.name'), accessor: 'name' },
    {
      header: t('columns.direction'),
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">{t(`directions.${row.direction}`)}</span>
      ),
    },
    {
      header: t('columns.resourceType'),
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">
          {t(`resourceTypes.${row.resourceType}` as 'resourceTypes.products')}
        </span>
      ),
    },
    {
      header: t('columns.delimiter'),
      accessor: (row) => (
        <span className="font-mono text-xs">{displayDelimiter(row.delimiter)}</span>
      ),
    },
    {
      header: t('columns.created'),
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(row.createdAt), {
            addSuffix: true,
            ...(dateLocale ? { locale: dateLocale } : {}),
          })}
        </span>
      ),
    },
    {
      header: '',
      accessor: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t('editAction')}
            onClick={() => {
              setEditing(row)
              setDialogOpen(true)
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
            aria-label={t('deleteAction')}
            onClick={() => {
              void handleDelete(row)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
      className: 'text-right w-20',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          {t('newButton')}
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card">
        <DataTable
          columns={columns}
          data={templates}
          isLoading={isLoading}
          emptyIcon={FileText}
          emptyTitle={t('empty')}
          emptyDescription={t('emptyHint')}
          rowKey={(row) => row.id}
        />
      </div>

      <MappingTemplateDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        template={editing}
      />
    </div>
  )
}
