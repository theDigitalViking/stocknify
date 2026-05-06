'use client'

import { Loader2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CredentialForm } from '@/components/integrations/credential-form'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCredentials,
  type CredentialType,
  type IntegrationCredential,
} from '@/lib/api/use-credentials'

interface CredentialSelectorProps {
  value: string | null
  onChange: (id: string) => void
  // Restrict the dropdown to specific protocols. Defaults to SFTP/FTP/FTPS.
  allowedTypes?: CredentialType[]
  // Initial protocol when the inline form is opened.
  initialProtocol?: CredentialType
}

const NEW_VALUE = '__new__'

export function CredentialSelector({
  value,
  onChange,
  allowedTypes = ['sftp', 'ftp', 'ftps'],
  initialProtocol = 'sftp',
}: CredentialSelectorProps): JSX.Element {
  const t = useTranslations('integrations.sftp.credentialSelector')
  const { data: credentials = [], isLoading } = useCredentials()
  const [showNewForm, setShowNewForm] = useState(false)

  const filtered = credentials.filter((c) => allowedTypes.includes(c.credentialType))

  function handleSelect(next: string): void {
    if (next === NEW_VALUE) {
      setShowNewForm(true)
      return
    }
    setShowNewForm(false)
    onChange(next)
  }

  function handleCreated(credential: IntegrationCredential): void {
    setShowNewForm(false)
    onChange(credential.id)
  }

  // Surface the currently selected credential so the operator sees host
  // metadata after picking — the dropdown trigger only shows the name.
  const selected = filtered.find((c) => c.id === value)

  return (
    <div className="space-y-3">
      <Select value={value ?? ''} onValueChange={handleSelect}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={isLoading ? t('loading') : t('placeholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NEW_VALUE}>
            <span className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t('newOption')}
            </span>
          </SelectItem>
          {filtered.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {c.credentialType}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {c.host ?? ''}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('loading')}
        </p>
      ) : null}

      {selected && !showNewForm ? (
        <CredentialMeta credential={selected} />
      ) : null}

      {showNewForm ? (
        <CredentialForm
          initialProtocol={initialProtocol}
          onCreated={handleCreated}
          onCancel={() => {
            setShowNewForm(false)
          }}
        />
      ) : null}
    </div>
  )
}

function CredentialMeta({ credential }: { credential: IntegrationCredential }): JSX.Element {
  const t = useTranslations('integrations.sftp.credentialSelector')
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
      <div>
        <span className="font-medium text-foreground">{t('hostLabel')}:</span>{' '}
        {credential.host ?? '—'}:{credential.port ?? '—'}
      </div>
      <div>
        <span className="font-medium text-foreground">{t('usernameLabel')}:</span>{' '}
        {credential.username ?? '—'}
      </div>
      {credential.remotePath ? (
        <div>
          <span className="font-medium text-foreground">{t('remotePathLabel')}:</span>{' '}
          {credential.remotePath}
        </div>
      ) : null}
    </div>
  )
}
