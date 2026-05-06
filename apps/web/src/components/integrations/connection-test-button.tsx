'use client'

import { CheckCircle2, Loader2, XCircle, Wifi } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ConnectionTestState {
  status: 'idle' | 'testing' | 'success' | 'error'
  error?: string
}

interface ConnectionTestButtonProps {
  onTest: () => Promise<{ success: boolean; error?: string }>
  disabled?: boolean
  size?: 'sm' | 'default'
  className?: string
  // When true, the button only renders an icon on success (compact form).
  compact?: boolean
}

export function ConnectionTestButton({
  onTest,
  disabled = false,
  size = 'sm',
  className,
  compact = false,
}: ConnectionTestButtonProps): JSX.Element {
  const t = useTranslations('integrations.sftp.connectionTest')
  const [state, setState] = useState<ConnectionTestState>({ status: 'idle' })

  // Auto-clear the success badge so the operator can re-run the test against
  // a tweaked field without clicking through a stale "connected" state.
  useEffect(() => {
    if (state.status !== 'success') return
    const timer = setTimeout(() => {
      setState({ status: 'idle' })
    }, 5_000)
    return (): void => {
      clearTimeout(timer)
    }
  }, [state.status])

  async function handleClick(): Promise<void> {
    setState({ status: 'testing' })
    try {
      const result = await onTest()
      if (result.success) {
        setState({ status: 'success' })
      } else {
        setState({ status: 'error', error: result.error ?? t('genericError') })
      }
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : t('genericError'),
      })
    }
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={disabled || state.status === 'testing'}
        onClick={() => {
          void handleClick()
        }}
        className="gap-1.5"
      >
        {state.status === 'testing' ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('testing')}
          </>
        ) : state.status === 'success' ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            {compact ? null : t('success')}
          </>
        ) : state.status === 'error' ? (
          <>
            <XCircle className="h-3.5 w-3.5 text-red-600" />
            {t('retry')}
          </>
        ) : (
          <>
            <Wifi className="h-3.5 w-3.5" />
            {t('label')}
          </>
        )}
      </Button>
      {state.status === 'error' && state.error ? (
        <p className="text-xs text-red-600 break-words max-w-md">{state.error}</p>
      ) : null}
    </div>
  )
}
