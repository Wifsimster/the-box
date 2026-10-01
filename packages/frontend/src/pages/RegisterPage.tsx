import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Password } from '@/components/ui/password'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { authClient, useSession } from '@/lib/auth-client'
import { Mail, Lock, User, Loader2 } from 'lucide-react'
import { AuthLayout, AuthFormError } from '@/components/security/AuthLayout'
import { safeRedirect, withRedirect } from '@/components/security/authRedirect'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { mapRegisterError } from '@/lib/auth-errors'
import { readStoredReferral, clearStoredReferral } from '@/hooks/useReferralCapture'
import { referralApi } from '@/lib/api/referral'
import { userApi } from '@/lib/api/user'
import { markWelcomePending } from '@/components/onboarding/welcome-storage'

type FormValues = {
  username: string
  email: string
  password: string
  confirmPassword: string
}

export default function RegisterPage() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const [searchParams] = useSearchParams()
  const requestedRedirect = safeRedirect(searchParams.get('redirect'))
  const [isLoading, setIsLoading] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)
  const { refetch: refetchSession } = useSession()

  const formSchema = useMemo(() => z.object({
    username: z
      .string()
      .trim()
      .min(3, { message: t('auth.usernameMin') })
      .max(50, { message: t('auth.usernameMax') }),
    email: z.string().trim().pipe(z.email({ message: t('auth.emailInvalid') })),
    password: z
      .string()
      .min(8, { message: t('auth.passwordTooShort') })
      .max(128, { message: t('auth.passwordTooLong') }),
    confirmPassword: z
      .string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('auth.passwordMismatch'),
    path: ['confirmPassword'],
  }), [t])

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true)

    try {
      const result = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: values.username,
        username: values.username,
      })

      if (result.error) {
        const errorKey = mapRegisterError(result.error)
        form.setError('root', {
          message: t(errorKey),
        })
        setIsLoading(false)
        return
      }

      // Better-auth automatically signs users in after registration

      // Wait for the session cookie to be set by better-auth
      await new Promise(resolve => setTimeout(resolve, 500))

      // Refetch the session to ensure React state is updated
      // refetch() may not return a value, so we just call it and then reload
      try {
        await refetchSession()
        // Wait a bit more for state to update
        await new Promise(resolve => setTimeout(resolve, 300))
      } catch (sessionError) {
        console.error('Error refetching session:', sessionError)
      }

      // Claim any stored referral code now that the user is authenticated.
      // Failures here are non-fatal — don't block the signup completion.
      const pendingReferral = readStoredReferral()
      if (pendingReferral) {
        try {
          await referralApi.claim(pendingReferral.code)
        } catch (refErr) {
          console.warn('Referral claim failed:', refErr)
        }
        clearStoredReferral()
      }

      // Persist the explicit marketing consent choice. Default is opt-out,
      // so only POST when the user ticked the box — keeps audit logs clean.
      if (marketingConsent) {
        try {
          await userApi.updateEmailConsent(true)
        } catch (consentErr) {
          console.warn('Email consent update failed:', consentErr)
        }
      }

      markWelcomePending()

      // Force a page reload to ensure cookies are picked up and session state is refreshed
      // This is more reliable than relying on React state updates
      // eslint-disable-next-line react-hooks/immutability -- Intentional page redirect after registration
      window.location.href = requestedRedirect || localizedPath('/')
    } catch (err) {
      const errorKey = mapRegisterError(err)
      form.setError('root', {
        message: t(errorKey),
      })
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <>
          {t('auth.hasAccount')}{' '}
          <Link
            to={withRedirect(localizedPath('/login'), requestedRedirect)}
            className="inline-flex min-h-11 items-center px-1 font-medium text-neon-purple transition-colors hover:text-neon-pink"
          >
            {t('auth.login')}
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" aria-busy={isLoading} noValidate>
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('auth.username')}</FormLabel>
                <div className="relative">
                  <User className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" aria-hidden="true" />
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t('auth.usernamePlaceholder')}
                      className="pl-10"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="next"
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('auth.email')}</FormLabel>
                <div className="relative">
                  <Mail className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" aria-hidden="true" />
                  <FormControl>
                    <Input
                      type="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      className="pl-10"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="next"
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('auth.password')}</FormLabel>
                <div className="relative">
                  <Lock className="pointer-events-none absolute inset-y-0 left-3 z-10 my-auto size-4 text-muted-foreground" aria-hidden="true" />
                  <FormControl>
                    <Password
                      placeholder="••••••••"
                      className="pl-10"
                      autoComplete="new-password"
                      enterKeyHint="next"
                      {...field}
                    />
                  </FormControl>
                </div>
                {form.formState.errors.password ? (
                  <FormMessage />
                ) : (
                  <FormDescription>{t('auth.passwordHint')}</FormDescription>
                )}
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('auth.confirmPassword')}</FormLabel>
                <div className="relative">
                  <Lock className="pointer-events-none absolute inset-y-0 left-3 z-10 my-auto size-4 text-muted-foreground" aria-hidden="true" />
                  <FormControl>
                    <Password
                      placeholder="••••••••"
                      className="pl-10"
                      autoComplete="new-password"
                      enterKeyHint="done"
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <label className="flex min-h-11 cursor-pointer select-none items-start gap-3 py-1">
            <Checkbox
              checked={marketingConsent}
              onCheckedChange={(checked) => setMarketingConsent(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed text-muted-foreground">
              {t('auth.marketingConsent')}
            </span>
          </label>

          <AuthFormError>{form.formState.errors.root?.message}</AuthFormError>

          <Button
            type="submit"
            variant="gaming"
            size="lg"
            className="w-full font-semibold"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            {t('auth.register')}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  )
}
