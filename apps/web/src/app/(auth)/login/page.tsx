'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn } from '@/lib/auth'

const loginSchema = z.object({
  email: z.string().email('emailInvalid'),
  password: z.string().min(8, 'passwordMin'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage(): JSX.Element {
  const router = useRouter()
  const t = useTranslations('auth')
  const tErrors = useTranslations('auth.validation')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setServerError(null)
    const { error } = await signIn(values.email, values.password)
    if (error) {
      setServerError(error)
      return
    }
    router.push('/stock')
    router.refresh()
  }

  return (
    <div className="bg-background rounded-md border border-border p-6 max-w-sm w-full">
      <h2 className="text-base font-semibold mb-4">{t('signIn')}</h2>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <Label htmlFor="email" className="mb-1 block">
            {t('email')}
          </Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email ? (
            <p className="text-xs text-red-600 mt-1">
              {tErrors(errors.email.message as 'emailInvalid')}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="password" className="mb-1 block">
            {t('password')}
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password ? (
            <p className="text-xs text-red-600 mt-1">
              {tErrors(errors.password.message as 'passwordMin')}
            </p>
          ) : null}
        </div>

        {serverError ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t('signingIn') : t('signIn')}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground text-center mt-6">
        {t('noAccount')}{' '}
        <Link href="/register" className="text-brand-700 font-medium hover:underline">
          {t('createOne')}
        </Link>
      </p>
    </div>
  )
}
