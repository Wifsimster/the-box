import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Lock, Palette } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { THEMES, applyTheme, type ThemeKey } from '@/lib/themes'
import { userApi } from '@/lib/api/user'
import { cn } from '@/lib/utils'

interface ThemeSwitcherProps {
  // Currently-selected theme key from the user record. Component is
  // controlled by `selected` + `onChange` so the parent (ProfilePage)
  // owns optimistic state and can roll back on failure.
  selected: ThemeKey
  isPremium: boolean
  onChange: (theme: ThemeKey) => void
}

// Premium-only theme picker. Free users see the catalog with locked
// premium themes routed to /pricing on click — no silent failure, no
// 402 surfacing in the UI.
export function ThemeSwitcher({ selected, isPremium, onChange }: ThemeSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const [saving, setSaving] = useState<ThemeKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSelect(key: ThemeKey, premiumOnly: boolean) {
    if (key === selected) return
    if (premiumOnly && !isPremium) {
      navigate(localizedPath('/pricing'))
      return
    }

    // Optimistic apply: skin the page immediately, roll back on failure.
    const previous = selected
    onChange(key)
    applyTheme(key)
    setSaving(key)
    setError(null)
    try {
      await userApi.updateTheme(key)
    } catch (err: unknown) {
      onChange(previous)
      applyTheme(previous)
      setError(err instanceof Error ? err.message : 'theme_update_failed')
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          {t('themes.title')}
        </CardTitle>
        <CardDescription>{t('themes.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEMES.map((theme) => {
            const locked = theme.premium && !isPremium
            const isSelected = theme.key === selected
            const isSaving = saving === theme.key
            return (
              <button
                key={theme.key}
                type="button"
                onClick={() => handleSelect(theme.key as ThemeKey, theme.premium)}
                disabled={isSaving}
                aria-pressed={isSelected}
                className={cn(
                  'relative rounded-lg border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border/60 bg-card/40 hover:border-primary/40',
                  locked && 'opacity-80',
                )}
              >
                <div
                  className={cn(
                    'h-12 rounded-md mb-2 bg-linear-to-r',
                    theme.swatch.from,
                    theme.swatch.to,
                  )}
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {t(`themes.options.${theme.i18nKey}`)}
                  </span>
                  {locked ? (
                    <Lock className="h-4 w-4 text-muted-foreground" aria-label={t('themes.locked')} />
                  ) : isSelected ? (
                    <Check className="h-4 w-4 text-success" aria-label={t('themes.selected')} />
                  ) : null}
                </div>
                {theme.premium && (
                  <div className="text-[10px] text-neon-pink uppercase tracking-wide mt-1">
                    {t('themes.premiumLabel')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
        {error && (
          <p className="text-xs text-destructive">{t('themes.errorMessage')}</p>
        )}
        {!isPremium && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(localizedPath('/pricing'))}
          >
            {t('themes.upgradeCta')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
