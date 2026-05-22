'use client'

import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCsvMappings } from '@/lib/api/use-csv'

interface MappingTemplateSelectorProps {
  value: string | null
  onChange: (id: string | null) => void
}

const DEFAULT_VALUE = '__default__'

export function MappingTemplateSelector({
  value,
  onChange,
}: MappingTemplateSelectorProps): JSX.Element {
  const t = useTranslations('integrations.sftp.mappingSelector')
  const { data: templates = [], isLoading } = useCsvMappings({
    direction: 'import',
    resourceType: 'stock',
  })

  function handleChange(next: string): void {
    onChange(next === DEFAULT_VALUE ? null : next)
  }

  return (
    <div className="space-y-2">
      <Select value={value ?? DEFAULT_VALUE} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={isLoading ? t('loading') : t('placeholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_VALUE}>
            <span className="font-medium">{t('defaultOption')}</span>
          </SelectItem>
          {templates.map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>
              {tpl.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-xs text-muted-foreground">
        {value === null ? t('defaultHelp') : t('templateHelp')}
      </p>

      <Link
        href="/stock/import"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
      >
        {t('manageTemplates')}
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  )
}
