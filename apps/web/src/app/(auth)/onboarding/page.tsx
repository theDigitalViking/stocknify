'use client'

import { Check, Plug } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import slugify from 'slugify'

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
import { toast } from '@/components/ui/use-toast'
import { useUpdateTenant } from '@/lib/api/use-tenant'
import { cn } from '@/lib/utils'

type Step = 0 | 1 | 2

const INTEGRATION_OPTIONS = [
  { id: 'shopify', name: 'Shopify', tint: 'bg-green-100 text-green-700' },
  { id: 'woocommerce', name: 'WooCommerce', tint: 'bg-purple-100 text-purple-700' },
  { id: 'xentral', name: 'Xentral', tint: 'bg-blue-100 text-blue-700' },
  { id: 'hive', name: 'Hive', tint: 'bg-amber-100 text-amber-700' },
  { id: 'byrd', name: 'Byrd', tint: 'bg-red-100 text-red-700' },
  { id: 'zenfulfillment', name: 'Zenfulfillment', tint: 'bg-gray-100 text-gray-700' },
]

function Stepper({ current }: { current: Step }): JSX.Element {
  const t = useTranslations('onboarding')
  const labels = [t('stepperCompany'), t('stepperIntegration'), t('stepperDone')]
  return (
    <div className="flex items-center gap-2 mb-8">
      {labels.map((label, idx) => {
        const isCompleted = idx < current
        const isActive = idx === current
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                'h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium border',
                isCompleted && 'bg-brand-600 border-brand-600 text-white',
                isActive && 'bg-background border-brand-600 text-brand-700',
                !isActive && !isCompleted && 'bg-background border-border text-muted-foreground',
              )}
            >
              {isCompleted ? <Check className="h-3 w-3" /> : idx + 1}
            </div>
            <span
              className={cn(
                'text-xs',
                isActive ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {idx < labels.length - 1 ? <div className="h-px w-8 bg-border" /> : null}
          </div>
        )
      })}
    </div>
  )
}

export default function OnboardingPage(): JSX.Element {
  const router = useRouter()
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('common')
  const [step, setStep] = useState<Step>(0)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const updateTenant = useUpdateTenant()

  useEffect(() => {
    if (!slugEdited) {
      const computed = slugify(name, { lower: true, strict: true })
      setSlug(computed)
    }
  }, [name, slugEdited])

  const [integrationModal, setIntegrationModal] = useState<string | null>(null)
  const [credential, setCredential] = useState('')
  const [savedIntegrations, setSavedIntegrations] = useState<string[]>([])

  async function submitCompany(): Promise<void> {
    try {
      await updateTenant.mutateAsync({ name: name.trim(), slug: slug.trim() })
      setStep(1)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('couldNotSave')
      toast({ title: t('couldNotSave'), description: message, variant: 'destructive' })
    }
  }

  function saveIntegration(): void {
    if (!integrationModal) return
    setSavedIntegrations((prev) => [...new Set([...prev, integrationModal])])
    setIntegrationModal(null)
    setCredential('')
    toast({ title: t('saved'), description: t('integrationSaved') })
  }

  const activeIntegration =
    integrationModal !== null
      ? (INTEGRATION_OPTIONS.find((o) => o.id === integrationModal) ?? null)
      : null

  return (
    <div className="bg-background rounded-md border border-border p-6 max-w-2xl w-full">
      <Stepper current={step} />

      {step === 0 ? (
        <div>
          <h2 className="text-base font-semibold mb-1">{t('step1Title')}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t('step1Description')}</p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="company-name" className="mb-1 block">
                {t('companyName')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="company-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                }}
                placeholder={t('companyNamePlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="company-slug" className="mb-1 block">
                {t('slug')}
              </Label>
              <Input
                id="company-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setSlugEdited(true)
                }}
                placeholder={t('slugPlaceholder')}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('slugHelp', { slug: slug || 'your-company' })}
              </p>
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <Button
              onClick={() => {
                void submitCompany()
              }}
              disabled={!name.trim() || !slug.trim() || updateTenant.isPending}
            >
              {updateTenant.isPending ? tCommon('saving') : tCommon('continue')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div>
          <h2 className="text-base font-semibold mb-1">{t('step2Title')}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t('step2Description')}</p>
          <div className="grid grid-cols-2 gap-3">
            {INTEGRATION_OPTIONS.map((opt) => {
              const isSaved = savedIntegrations.includes(opt.id)
              return (
                <div
                  key={opt.id}
                  className="border border-border rounded-md p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-md flex items-center justify-center text-xs font-semibold',
                        opt.tint,
                      )}
                    >
                      {opt.name.charAt(0)}
                    </div>
                    <span className="text-sm font-medium">{opt.name}</span>
                  </div>
                  {isSaved ? (
                    <span className="flex items-center gap-1 text-xs text-green-700">
                      <Check className="h-3 w-3" /> {t('saved')}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIntegrationModal(opt.id)
                      }}
                    >
                      <Plug className="h-3 w-3" />
                      {t('connectButton')}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-6">
            <button
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => {
                setStep(2)
              }}
            >
              {t('skipForNow')}
            </button>
            <Button
              onClick={() => {
                setStep(2)
              }}
            >
              {tCommon('continue')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="py-6 text-center">
          <div className="h-10 w-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-4">
            <Check className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold mb-1">{t('step3Title')}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t('step3Description')}</p>
          <Button
            onClick={() => {
              router.push('/products')
            }}
          >
            {t('goToDashboard')}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={integrationModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIntegrationModal(null)
            setCredential('')
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {activeIntegration ? t('connectTitle', { name: activeIntegration.name }) : ''}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="credential" className="mb-1 block">
              {t('credentialLabel')}
            </Label>
            <Input
              id="credential"
              value={credential}
              onChange={(e) => {
                setCredential(e.target.value)
              }}
              placeholder={t('credentialPlaceholder')}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground mt-2">{t('credentialHelp')}</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIntegrationModal(null)
                setCredential('')
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button onClick={saveIntegration} disabled={credential.trim().length === 0}>
              {tCommon('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
