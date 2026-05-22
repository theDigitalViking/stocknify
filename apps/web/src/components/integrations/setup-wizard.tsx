'use client'

import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { CredentialSelector } from '@/components/integrations/credential-selector'
import { DirectoryBrowser } from '@/components/integrations/directory-browser'
import { MappingTemplateSelector } from '@/components/integrations/mapping-template-selector'
import {
  ScheduleBuilder,
  formatSchedulePreview,
  type ScheduleBuilderValue,
} from '@/components/integrations/schedule-builder'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import {
  useCredentials,
  type CredentialType,
} from '@/lib/api/use-credentials'
import {
  useInstallIntegration,
  useUpdateIntegration,
} from '@/lib/api/use-integrations'
import { absoluteToRelativeImportPath } from '@/lib/remote-path'
import { cn } from '@/lib/utils'

interface SetupWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 1 | 2 | 3 | 4 | 5

const SFTP_KEY = 'sftp'

// We track schedule-on/off separately so the operator can pick "manual only"
// without sending bogus interval values to the server.
interface WizardState {
  protocol: CredentialType
  credentialId: string | null
  filePath: string | null
  // Cycle 5-E: sub-directory under the credential's remote path. `null`
  // means "use the credential's remotePath" — same default behaviour the
  // worker had before this field existed.
  importPath: string | null
  mappingTemplateId: string | null
  scheduleEnabled: boolean
  schedule: ScheduleBuilderValue
  // Operators get to name the integration up front so multiple SFTP installs
  // are distinguishable on the marketplace card list.
  integrationName: string
}

const INITIAL: WizardState = {
  protocol: 'sftp',
  credentialId: null,
  filePath: null,
  importPath: null,
  mappingTemplateId: null,
  scheduleEnabled: true,
  schedule: { scheduleType: 'interval_hours', intervalValue: 1 },
  integrationName: '',
}

export function SetupWizard({ open, onOpenChange }: SetupWizardProps): JSX.Element {
  const t = useTranslations('integrations.sftp.wizard')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [step, setStep] = useState<Step>(1)
  const [state, setState] = useState<WizardState>(INITIAL)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const credentialsQuery = useCredentials()
  const install = useInstallIntegration()
  const updateIntegration = useUpdateIntegration()

  const linkedCredential =
    state.credentialId !== null
      ? credentialsQuery.data?.find((c) => c.id === state.credentialId) ?? null
      : null

  function reset(): void {
    setStep(1)
    setState(INITIAL)
    setIsSubmitting(false)
  }

  function handleClose(open: boolean): void {
    if (!open) reset()
    onOpenChange(open)
  }

  function next(): void {
    setStep((s) => (Math.min(5, s + 1) as Step))
  }

  function back(): void {
    setStep((s) => (Math.max(1, s - 1) as Step))
  }

  async function handleSubmit(): Promise<void> {
    setIsSubmitting(true)
    try {
      // Multi-install: every wizard run creates a fresh SFTP integration row.
      // No reuse of an existing install — operators with two SFTP servers
      // want two distinguishable installations.
      const installed = await install.mutateAsync({
        key: SFTP_KEY,
        ...(state.integrationName.trim() ? { name: state.integrationName.trim() } : {}),
      })
      const integrationId = installed.integration?.id ?? null

      if (!integrationId) {
        throw new Error('Install succeeded but integration id is missing')
      }

      // Cycle 5-A.5 + 5-E: persist Credential + Mapping + importPath on the
      // Integration itself (authoritative defaults). The schedule POST below
      // then omits credential/mapping and the backend / worker resolve them
      // via Integration fallback; the worker reads importPath directly off
      // the integration row at run time.
      if (
        state.credentialId ||
        state.mappingTemplateId ||
        state.importPath !== null
      ) {
        await updateIntegration.mutateAsync({
          id: integrationId,
          ...(state.credentialId ? { credentialId: state.credentialId } : {}),
          ...(state.mappingTemplateId ? { csvMappingTemplateId: state.mappingTemplateId } : {}),
          ...(state.importPath !== null ? { importPath: state.importPath } : {}),
        })
      }

      // Inline schedule create via fetch — TanStack hooks need their
      // integrationId bound at instantiation, but we only learn it here.
      // Switching to a service function or a deferred mutation factory is a
      // future refactor; at MVP scale a one-off fetch is acceptable.
      if (state.scheduleEnabled && state.credentialId) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? ''}/v1/integrations/${integrationId}/schedules`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(await getAuthHeaders()),
            },
            body: JSON.stringify({
              name: state.integrationName.trim() || 'SFTP/FTP import',
              resourceType: 'stock',
              direction: 'import',
              scheduleType: state.schedule.scheduleType,
              ...(state.schedule.intervalValue !== undefined
                ? { intervalValue: state.schedule.intervalValue }
                : {}),
              ...(state.schedule.timeOfDay ? { timeOfDay: state.schedule.timeOfDay } : {}),
              ...(state.schedule.weekdays ? { weekdays: state.schedule.weekdays } : {}),
              // Cycle 5-A.5: credential + mapping omitted — backend reads
              // them from Integration via the PATCH above.
            }),
          },
        )
        if (!res.ok) {
          // Parse the envelope so the operator sees why the schedule failed
          // even though the install succeeded. Toast surfaces the message;
          // the integration is already created, so the user can retry inside
          // the config page.
          const json = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(
            json?.error?.message ?? `Schedule create failed (HTTP ${String(res.status)})`,
          )
        }
      }

      toast({ title: t('successToast') })
      handleClose(false)
      router.push(`/integrations/automatic/${integrationId}`)
    } catch (err) {
      toast({
        title: t('failedToast'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Per-step gating. Step 1 → credential selected; step 2 → no requirements
  // (file is optional, "newest" auto-pick is fine); step 3-4 always passes.
  const canAdvance = (() => {
    switch (step) {
      case 1:
        return state.credentialId !== null
      case 2:
        return true
      case 3:
        return true
      case 4:
        return true
      default:
        return true
    }
  })()

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600" />
            {t('title')}
          </DialogTitle>
          <StepIndicator current={step} />
        </DialogHeader>

        <div className="py-2 min-h-[280px]">
          {step === 1 && <Step1Connection state={state} setState={setState} />}
          {step === 2 && state.credentialId && (
            <Step2Directory
              state={state}
              setState={setState}
              linkedRemotePath={linkedCredential?.remotePath ?? null}
            />
          )}
          {step === 3 && <Step3Mapping state={state} setState={setState} />}
          {step === 4 && <Step4Schedule state={state} setState={setState} />}
          {step === 5 && <Step5Summary state={state} linkedCredential={linkedCredential} />}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (step === 1) {
                handleClose(false)
              } else {
                back()
              }
            }}
            disabled={isSubmitting}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {step === 1 ? tCommon('cancel') : t('back')}
          </Button>

          {step < 5 ? (
            <Button
              type="button"
              size="sm"
              onClick={next}
              disabled={!canAdvance}
              className="gap-1.5"
            >
              {t('next')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void handleSubmit()
              }}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {t('submit')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Pull the supabase access token for the wizard's inline schedule POST. The
// regular hook-based flow couldn't be used because the integration id is
// generated mid-submit; once we move to a server action the inline fetch can
// be retired.
async function getAuthHeaders(): Promise<{ Authorization: string }> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase')
  const supabase = createSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token ?? ''}` }
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: Step }): JSX.Element {
  const t = useTranslations('integrations.sftp.wizard.steps')
  const labels = [t('connection'), t('directory'), t('mapping'), t('schedule'), t('summary')]
  return (
    <div className="flex items-center gap-1.5 mt-3">
      {labels.map((label, idx) => {
        const stepNum = idx + 1
        const isActive = stepNum === current
        const isComplete = stepNum < current
        return (
          <div key={label} className="flex items-center gap-1.5 flex-1">
            <div
              className={cn(
                'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0',
                isActive && 'bg-brand-600 text-white',
                isComplete && 'bg-brand-100 text-brand-700',
                !isActive && !isComplete && 'bg-muted text-muted-foreground',
              )}
            >
              {isComplete ? <Check className="h-3 w-3" /> : stepNum}
            </div>
            <span
              className={cn(
                'text-[11px] truncate',
                isActive ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Step1Connection({
  state,
  setState,
}: {
  state: WizardState
  setState: React.Dispatch<React.SetStateAction<WizardState>>
}): JSX.Element {
  const t = useTranslations('integrations.sftp.wizard.step1')
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('description')}</p>

      <div>
        <Label htmlFor="wizard-name" className="mb-1 block">
          {t('nameLabel')}
        </Label>
        <Input
          id="wizard-name"
          value={state.integrationName}
          onChange={(e) => {
            setState((s) => ({ ...s, integrationName: e.target.value }))
          }}
          placeholder={t('namePlaceholder')}
        />
      </div>

      <div>
        <Label className="mb-2 block">{t('credentialLabel')}</Label>
        <CredentialSelector
          value={state.credentialId}
          onChange={(id) => {
            setState((s) => ({ ...s, credentialId: id }))
          }}
          initialProtocol={state.protocol}
        />
      </div>
    </div>
  )
}

function Step2Directory({
  state,
  setState,
  linkedRemotePath,
}: {
  state: WizardState
  setState: React.Dispatch<React.SetStateAction<WizardState>>
  linkedRemotePath: string | null
}): JSX.Element {
  const t = useTranslations('integrations.sftp.wizard.step2')
  // Cycle 5-E — real click-through browser. The new browse endpoint only
  // needs a credentialId (the wizard doesn't have an integration id yet),
  // so the operator can navigate the remote tree before the integration is
  // installed. Picking a directory writes it to state.importPath; picking a
  // CSV file writes to state.filePath. Both are optional — leaving them
  // empty falls back to "credential root, newest CSV".
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('description')}</p>
      {linkedRemotePath ? (
        <p className="text-xs text-muted-foreground">
          {t('linkedRemotePath', { path: linkedRemotePath })}
        </p>
      ) : null}
      <DirectoryBrowser
        credentialId={state.credentialId ?? undefined}
        initialPath={linkedRemotePath ?? ''}
        baseRoot={linkedRemotePath}
        onDirectorySelect={(dir) => {
          // Convert the absolute path from the browser into the relative
          // sub-segment the backend stores (Codex 5-E review fix F1).
          // `null` clears the override — happens when the operator picks
          // the credential root itself.
          const relative = absoluteToRelativeImportPath(dir, linkedRemotePath)
          setState((s) => ({ ...s, importPath: relative }))
        }}
        onFileSelect={(file) => {
          setState((s) => ({ ...s, filePath: file }))
        }}
        selectedDirectory={state.importPath}
        selectedFile={state.filePath}
      />
    </div>
  )
}

function Step3Mapping({
  state,
  setState,
}: {
  state: WizardState
  setState: React.Dispatch<React.SetStateAction<WizardState>>
}): JSX.Element {
  const t = useTranslations('integrations.sftp.wizard.step3')
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('description')}</p>
      <MappingTemplateSelector
        value={state.mappingTemplateId}
        onChange={(id) => {
          setState((s) => ({ ...s, mappingTemplateId: id }))
        }}
      />
    </div>
  )
}

function Step4Schedule({
  state,
  setState,
}: {
  state: WizardState
  setState: React.Dispatch<React.SetStateAction<WizardState>>
}): JSX.Element {
  const t = useTranslations('integrations.sftp.wizard.step4')
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('description')}</p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!state.scheduleEnabled}
          onChange={(e) => {
            setState((s) => ({ ...s, scheduleEnabled: !e.target.checked }))
          }}
          className="h-4 w-4 rounded border-border"
        />
        {t('manualOnlyLabel')}
      </label>

      {state.scheduleEnabled ? (
        <ScheduleBuilder
          value={state.schedule}
          onChange={(next) => {
            setState((s) => ({ ...s, schedule: next }))
          }}
        />
      ) : null}
    </div>
  )
}

function Step5Summary({
  state,
  linkedCredential,
}: {
  state: WizardState
  linkedCredential: { name: string; host: string | null; port: number | null } | null
}): JSX.Element {
  const t = useTranslations('integrations.sftp.wizard.step5')
  const tSchedule = useTranslations('integrations.sftp.scheduleBuilder')
  // Cycle 5-C — wizard summary surfaces the default post-import handling
  // so the operator sees what happens to their CSV file after a successful
  // or failed import. The wizard doesn't expose toggles for these fields;
  // every new install inherits the schema defaults (archive / archive,
  // 3 retries) and the Edit-Page is where they can be changed.
  const tConfig = useTranslations('integrations.sftp.config')
  const locale = useLocale()
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">{t('description')}</p>

      <SummaryRow
        label={t('integrationLabel')}
        value={state.integrationName.trim() || t('defaultName')}
      />
      <SummaryRow
        label={t('connectionLabel')}
        value={
          linkedCredential
            ? `${linkedCredential.name} (${linkedCredential.host ?? '?'}:${
                linkedCredential.port ?? '?'
              })`
            : '—'
        }
      />
      <SummaryRow
        label={t('importPathLabel')}
        value={state.importPath ?? t('importPathDefault')}
      />
      <SummaryRow
        label={t('directoryLabel')}
        value={state.filePath ?? t('autoNewest')}
      />
      <SummaryRow
        label={t('mappingLabel')}
        value={state.mappingTemplateId ?? t('mappingDefault')}
      />
      <SummaryRow
        label={t('scheduleLabel')}
        value={
          !state.scheduleEnabled
            ? t('manualOnly')
            : formatSchedulePreview(state.schedule, locale, tSchedule)
        }
      />
      <SummaryRow
        label={tConfig('postImportSuccessSubsection')}
        value={tConfig('actionArchive')}
      />
      <SummaryRow
        label={tConfig('postImportFailedSubsection')}
        value={`${tConfig('actionArchive')} (${tConfig('maxRetriesLabel')}: 3)`}
      />
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-border pb-2 last:border-b-0">
      <span className="text-xs font-medium text-muted-foreground col-span-1">{label}</span>
      <span className="text-xs text-foreground col-span-2 break-words">{value}</span>
    </div>
  )
}
