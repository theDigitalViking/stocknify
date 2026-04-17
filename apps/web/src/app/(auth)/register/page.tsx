'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signUp } from '@/lib/auth'

const registerSchema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type RegisterFormValues = z.infer<typeof registerSchema>

export default function RegisterPage(): JSX.Element {
  const router = useRouter()
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
    const { error } = await signUp(values.email, values.password)
    if (error) {
      setServerError(error)
      return
    }
    setSuccess(true)
    setTimeout(() => router.push('/login'), 3000)
  }

  if (success) {
    return (
      <div className="bg-background rounded-md border border-border p-6 text-center max-w-sm w-full">
        <h2 className="text-base font-semibold mb-2">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation email. Click the link to activate your account.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-background rounded-md border border-border p-6 max-w-sm w-full">
      <h2 className="text-base font-semibold mb-4">Create your account</h2>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <Label htmlFor="email" className="mb-1 block">
            Email
          </Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email ? (
            <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="password" className="mb-1 block">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
          {errors.password ? (
            <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="confirmPassword" className="mb-1 block">
            Confirm password
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
          {errors.confirmPassword ? (
            <p className="text-xs text-red-600 mt-1">{errors.confirmPassword.message}</p>
          ) : null}
        </div>

        {serverError ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground text-center mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-700 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
