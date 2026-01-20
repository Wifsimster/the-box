import { useState, useMemo } from 'react'
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
import { authClient, useSession } from '@/lib/auth-client'
import { Mail, Lock, User, Loader2 } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { mapRegisterError } from '@/lib/auth-errors'

type FormValues = {
  username: string
  email: string
  password: string
  confirmPassword: string
}

export default function RegisterPage() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const [isLoading, setIsLoading] = useState(false)
  const { refetch: refetchSession } = useSession()

  const formSchema = useMemo(() => z.object({
    username: z
      .string()
      .min(3, { message: t('auth.usernameMin') })
      .max(50, { message: t('auth.usernameMax') }),
    email: z
      .string()
      .email({ message: t('auth.emailInvalid') }),
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
      // Log the full response for debugging
      console.log('Registration response:', result)
      
      if (result.data && 'session' in result.data && result.data.session) {
        console.log('Registration successful, session created:', result.data.session)
      } else if (result.data?.user) {
        console.log('Registration successful, user created:', result.data.user)
        console.warn('No session in response - backend may not have created session automatically')
      }

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
      
      // Force a page reload to ensure cookies are picked up and session state is refreshed
      // This is more reliable than relying on React state updates
      window.location.href = localizedPath('/')
    } catch (err) {
      const errorKey = mapRegisterError(err)
      form.setError('root', {
        message: t(errorKey),
      })
      setIsLoading(false)
    }
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
                {t('auth.registerTitle')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('auth.registerSubtitle')}
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/80">
                        {t('auth.username')}
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-cyan transition-colors" />
                          <Input
                            type="text"
                            placeholder={t('auth.usernamePlaceholder')}
                            className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-cyan/50 rounded-xl"
                            autoComplete="off"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-cyan transition-colors" />
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-cyan/50 rounded-xl"
                            autoComplete="email"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/80">
                        {t('auth.password')}
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-cyan transition-colors" />
                          <Input
                            type="password"
                            placeholder="••••••••"
                            className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-cyan/50 rounded-xl"
                            autoComplete="new-password"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/80">
                        {t('auth.confirmPassword')}
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-cyan transition-colors" />
                          <Input
                            type="password"
                            placeholder="••••••••"
                            className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-cyan/50 rounded-xl"
                            autoComplete="new-password"
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
                    t('auth.register')
                  )}
                </Button>
              </form>
            </Form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              {t('auth.hasAccount')}{' '}
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
