import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
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
import { Mail, Loader2, ArrowLeft } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

const formSchema = z.object({
  email: z
    .string()
    .email({ message: 'Please enter a valid email address' }),
})

type FormValues = z.infer<typeof formSchema>

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const { localizedPath, currentLang } = useLocalizedPath()
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
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
        onError: (ctx: { error: { message?: string } }) => {
          form.setError('root', {
            message: ctx.error.message || t('auth.resetError'),
          })
        },
      })
    } catch {
      form.setError('root', {
        message: t('auth.resetError'),
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <>
        <CubeBackground />
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md -mt-20"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="backdrop-blur-xl bg-card/30 border border-white/10 rounded-2xl p-8 shadow-2xl text-center"
            >
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {t('auth.checkEmail')}
              </h2>
              <p className="text-muted-foreground text-sm mb-6">
                {t('auth.resetEmailInstructions', { email: submittedEmail })}
              </p>

              <Link to={localizedPath('/login')}>
                <Button variant="outline" className="w-full h-12 rounded-xl border-white/10">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t('auth.backToLogin')}
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </>
    )
  }

  return (
    <>
      <CubeBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md -mt-20"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="backdrop-blur-xl bg-card/30 border border-white/10 rounded-2xl p-8 shadow-2xl"
          >
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {t('auth.forgotPassword')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('auth.forgotPasswordSubtitle')}
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/80">
                        {t('auth.email')}
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-pink transition-colors" />
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-pink/50 rounded-xl"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.formState.errors.root && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                  >
                    {form.formState.errors.root.message}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  variant="gaming"
                  size="lg"
                  className="w-full h-12 text-base font-semibold rounded-xl"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    t('auth.sendResetLink')
                  )}
                </Button>
              </form>
            </Form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              {t('auth.rememberPassword')}{' '}
              <Link
                to={localizedPath('/login')}
                className="text-neon-purple hover:text-neon-pink font-medium transition-colors"
              >
                {t('auth.login')}
              </Link>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </>
  )
}
