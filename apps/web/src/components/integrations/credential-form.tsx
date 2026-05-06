'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ConnectionTestButton } from '@/components/integrations/connection-test-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import {
  useCreateCredential,
  useTestUnsavedCredential,
  type CredentialType,
  type IntegrationCredential,
} from '@/lib/api/use-credentials'

interface CredentialFormProps {
  // Optional initial protocol — used by the wizard step that pre-selects the
  // protocol from the previous radio group.
  initialProtocol?: CredentialType
  onCreated?: (credential: IntegrationCredential) => void
  onCancel?: () => void
}

const DEFAULT_PORTS: Record<CredentialType, number> = {
  sftp: 22,
  ftp: 21,
  ftps: 21,
}

export function CredentialForm({
  initialProtocol = 'sftp',
  onCreated,
  onCancel,
}: CredentialFormProps): JSX.Element {
  const t = useTranslations('integrations.sftp.credentialForm')
  const tCommon = useTranslations('common')
  const create = useCreateCredential()
  const testUnsaved = useTestUnsavedCredential()

  const [name, setName] = useState('')
  const [protocol, setProtocol] = useState<CredentialType>(initialProtocol)
  const [host, setHost] = useState('')
  const [port, setPort] = useState<string>(String(DEFAULT_PORTS[initialProtocol]))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remotePath, setRemotePath] = useState('')

  function handleProtocolChange(next: CredentialType): void {
    setProtocol(next)
    // Reset port to the protocol default whenever the user toggles — only if
    // the operator hasn't manually entered something off-default. We compare
    // to the previous protocol's default to detect "still on default".
    const wasDefault = port === String(DEFAULT_PORTS[protocol])
    if (wasDefault) {
      setPort(String(DEFAULT_PORTS[next]))
    }
  }

  // Connection-test only needs host + username; password is optional (for
  // anonymous FTP) but we always send what we have.
  const canTest = host.trim() !== '' && username.trim() !== ''

  async function handleTest(): Promise<{ success: boolean; error?: string }> {
    return testUnsaved.mutateAsync({
      // Server requires a name on the create-shaped schema even though we
      // don't persist anything — placeholder is fine for the test path.
      name: name.trim() || 'unsaved-test',
      credentialType: protocol,
      host: host.trim(),
      port: parsePort(port, protocol),
      username: username.trim(),
      ...(password ? { password } : {}),
    })
  }

  const canSave =
    name.trim() !== '' && host.trim() !== '' && username.trim() !== '' && !create.isPending

  async function handleSave(): Promise<void> {
    if (!canSave) return
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        credentialType: protocol,
        host: host.trim(),
        port: parsePort(port, protocol),
        username: username.trim(),
        ...(password ? { password } : {}),
        ...(remotePath.trim() ? { remotePath: remotePath.trim() } : {}),
      })
      toast({ title: t('savedToast', { name: created.name }) })
      onCreated?.(created)
    } catch (err) {
      toast({
        title: t('saveFailedToast'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
      <div>
        <Label htmlFor="cred-name" className="mb-1 block">
          {t('nameLabel')}
        </Label>
        <Input
          id="cred-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
          placeholder={t('namePlaceholder')}
        />
      </div>

      <div>
        <Label className="mb-1 block">{t('protocolLabel')}</Label>
        <div className="flex gap-2">
          {(['sftp', 'ftp', 'ftps'] as CredentialType[]).map((p) => (
            <label
              key={p}
              className={cnRadio(protocol === p)}
            >
              <input
                type="radio"
                name="cred-protocol"
                value={p}
                checked={protocol === p}
                onChange={() => {
                  handleProtocolChange(p)
                }}
                className="sr-only"
              />
              {p.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Label htmlFor="cred-host" className="mb-1 block">
            {t('hostLabel')}
          </Label>
          <Input
            id="cred-host"
            value={host}
            onChange={(e) => {
              setHost(e.target.value)
            }}
            placeholder="sftp.example.com"
          />
        </div>
        <div>
          <Label htmlFor="cred-port" className="mb-1 block">
            {t('portLabel')}
          </Label>
          <Input
            id="cred-port"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => {
              setPort(e.target.value)
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="cred-user" className="mb-1 block">
            {t('usernameLabel')}
          </Label>
          <Input
            id="cred-user"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
            }}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="cred-pass" className="mb-1 block">
            {t('passwordLabel')}
          </Label>
          <Input
            id="cred-pass"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
            }}
            autoComplete="new-password"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="cred-path" className="mb-1 block">
          {t('remotePathLabel')}
        </Label>
        <Input
          id="cred-path"
          value={remotePath}
          onChange={(e) => {
            setRemotePath(e.target.value)
          }}
          placeholder="/inbound/stock"
        />
        <p className="text-xs text-muted-foreground mt-1">{t('remotePathHelp')}</p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <ConnectionTestButton onTest={handleTest} disabled={!canTest} />

        <div className="flex gap-2">
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={create.isPending}
            >
              {tCommon('cancel')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void handleSave()
            }}
            disabled={!canSave}
            className="gap-1.5"
          >
            {create.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function parsePort(raw: string, protocol: CredentialType): number {
  const n = Number.parseInt(raw, 10)
  if (Number.isFinite(n) && n >= 1 && n <= 65535) return n
  return DEFAULT_PORTS[protocol]
}

function cnRadio(active: boolean): string {
  // Tailwind classes inlined here so the radio looks like a segmented button
  // without pulling in the Radix tabs primitive for three buttons.
  return [
    'cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
    active
      ? 'border-brand-600 bg-brand-50 text-brand-700'
      : 'border-border bg-background text-muted-foreground hover:bg-muted',
  ].join(' ')
}
