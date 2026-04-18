'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signUp } from '@/lib/auth'

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'firstNameRequired'),
    lastName: z.string().min(1, 'lastNameRequired'),
    companyName: z.string().min(1, 'companyNameRequired'),
    email: z.string().email('emailInvalid'),
    password: z.string().min(8, 'passwordMin'),
    confirmPassword: z.string().min(1, 'confirmPassword'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'passwordsMatch',
    path: ['confirmPassword'],
  })

type RegisterFormValues = z.infer<typeof registerSchema>
type ValidationKey =
  | 'firstNameRequired'
  | 'lastNameRequired'
  | 'companyNameRequired'
  | 'emailInvalid'
  | 'passwordMin'
  | 'confirmPassword'
  | 'passwordsMatch'

export default function RegisterPage(): JSX.Element {
  const t = useTranslations('auth')
  const tErrors = useTranslations('auth.validation')
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(values: RegisterFormValues): Promise<void> {
    setServerError(null)
    const { error } = await signUp(values.email, values.password, {
      firstName: values.firstName,
      lastName: values.lastName,
      companyName: values.companyName,
    })
    if (error) {
      setServerError(error)
      return
    }
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="bg-background rounded-md border border-border p-6 text-center max-w-sm w-full">
        <h2 className="text-base font-semibold mb-2">{t('checkInbox')}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t('confirmationSent')}</p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-brand-700 font-medium hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('backToLogin')}
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-background rounded-md border border-border p-6 max-w-sm w-full">
      <h2 className="text-base font-semibold mb-4">{t('signUp')}</h2>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="firstName" className="mb-1 block">
              {t('firstName')}
            </Label>
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              {...register('firstName')}
            />
            {errors.firstName ? (
              <p className="text-xs text-red-600 mt-1">
                {tErrors(errors.firstName.message as ValidationKey)}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="lastName" className="mb-1 block">
              {t('lastName')}
            </Label>
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              {...register('lastName')}
            />
            {errors.lastName ? (
              <p className="text-xs text-red-600 mt-1">
                {tErrors(errors.lastName.message as ValidationKey)}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <Label htmlFor="companyName" className="mb-1 block">
            {t('companyName')}
          </Label>
          <Input
            id="companyName"
            type="text"
            autoComplete="organization"
            {...register('companyName')}
          />
          {errors.companyName ? (
            <p className="text-xs text-red-600 mt-1">
              {tErrors(errors.companyName.message as ValidationKey)}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="email" className="mb-1 block">
            {t('email')}
          </Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email ? (
            <p className="text-xs text-red-600 mt-1">
              {tErrors(errors.email.message as ValidationKey)}
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
            autoComplete="new-password"
            {...register('password')}
          />
          {errors.password ? (
            <p className="text-xs text-red-600 mt-1">
              {tErrors(errors.password.message as ValidationKey)}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="confirmPassword" className="mb-1 block">
            {t('confirmPassword')}
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
          {errors.confirmPassword ? (
            <p className="text-xs text-red-600 mt-1">
              {tErrors(errors.confirmPassword.message as ValidationKey)}
            </p>
          ) : null}
        </div>

        {serverError ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t('creatingAccount') : t('signUp')}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground text-center mt-6">
        {t('hasAccount')}{' '}
        <Link href="/login" className="text-brand-700 font-medium hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </div>
  )
}
