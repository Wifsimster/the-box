import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { requestPasswordReset } from '@/lib/auth-client'
import { Mail, MailCheck, Loader2, ArrowLeft } from 'lucide-react'
import { AuthLayout, AuthFormError } from '@/components/security/AuthLayout'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { mapPasswordResetError } from '@/lib/auth-errors'

type FormValues = { email: string }

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const { localizedPath, currentLang } = useLocalizedPath()
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  const formSchema = useMemo(
    () => z.object({
      email: z.string().trim().pipe(z.email({ message: t('auth.emailInvalid') })),
    }),
    [t],
  )

  const prefilledEmail = (location.state as { email?: string } | null)?.email ?? ''

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: {
      email: prefilledEmail,
    },
  })

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true)

    try {
      await requestPasswordReset({
        email: values.email,
        redirectTo: `${window.location.origin}/${currentLang}/reset-password`,
      }, {
        onSuccess: () => {
          setSubmittedEmail(values.email)
          setSuccess(true)
        },
        onError: (ctx) => {
          const errorKey = mapPasswordResetError(ctx.error)
          form.setError('root', {
            message: t(errorKey),
          })
        },
      })
    } catch (err) {
      const errorKey = mapPasswordResetError(err)
      form.setError('root', {
        message: t(errorKey),
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout
        icon={MailCheck}
        iconClassName="bg-success/15 text-success"
        title={t('auth.checkEmail')}
        subtitle={
          <span role="status">{t('auth.resetEmailInstructions', { email: submittedEmail })}</span>
        }
      >
        <div className="space-y-3">
          <Button variant="gaming" size="lg" className="w-full" asChild>
            <Link to={localizedPath('/login')}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t('auth.backToLogin')}
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setSuccess(false)}
          >
            {t('auth.useAnotherEmail')}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.forgotPassword')}
      subtitle={t('auth.forgotPasswordSubtitle')}
      footer={
        <>
          {t('auth.rememberPassword')}{' '}
          <Link
            to={localizedPath('/login')}
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
                      enterKeyHint="send"
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <AuthFormError>{form.formState.errors.root?.message}</AuthFormError>

          <Button
            type="submit"
            variant="gaming"
            size="lg"
            className="w-full font-semibold"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            {t('auth.sendResetLink')}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  )
}
