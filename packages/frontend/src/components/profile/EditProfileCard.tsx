import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserPen, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { userApi, UserApiError } from '@/lib/api/user'
import { sortedCountryOptions } from '@/lib/countries'
import type { CountryCode, User } from '@the-box/types'

// Radix Select cannot hold an empty value, so "no country" gets a sentinel.
const NO_COUNTRY = 'none'

interface EditProfileCardProps {
  displayName: string
  username: string
  country?: CountryCode
  // Called with the updated User so the parent can refresh its cached profile.
  onUpdated?: (user: User) => void
}

/**
 * Lets the user edit their display name, username and optional country
 * (used only by the monthly country ranking, never inferred from the IP). Submits to
 * PUT /api/user/profile and surfaces field-specific errors (taken username,
 * invalid formats) as toasts.
 */
export function EditProfileCard({
  displayName: initialDisplayName,
  username: initialUsername,
  country: initialCountry,
  onUpdated,
}: EditProfileCardProps) {
  const { t, i18n } = useTranslation()
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [username, setUsername] = useState(initialUsername)
  const [country, setCountry] = useState<string>(initialCountry ?? NO_COUNTRY)
  const [isSaving, setIsSaving] = useState(false)
  const countryOptions = useMemo(() => sortedCountryOptions(i18n.language), [i18n.language])

  const countryChanged = country !== (initialCountry ?? NO_COUNTRY)
  const isDirty =
    displayName !== initialDisplayName || username !== initialUsername || countryChanged

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isSaving || !isDirty) return
    setIsSaving(true)
    try {
      const updated = await userApi.updateProfile({
        displayName,
        username,
        ...(countryChanged ? { country: country === NO_COUNTRY ? null : country } : {}),
      })
      toast.success(t('editProfile.saved'))
      onUpdated?.(updated)
    } catch (err) {
      if (err instanceof UserApiError) {
        switch (err.code) {
          case 'USERNAME_TAKEN':
            toast.error(t('editProfile.usernameTaken'))
            break
          case 'INVALID_USERNAME':
            toast.error(t('editProfile.invalidUsername'))
            break
          case 'INVALID_DISPLAY_NAME':
            toast.error(t('editProfile.invalidDisplayName'))
            break
          case 'INVALID_COUNTRY':
            toast.error(t('editProfile.invalidCountry'))
            break
          default:
            toast.error(t('editProfile.error'))
        }
      } else {
        toast.error(t('editProfile.error'))
      }
      console.error('Failed to update profile:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPen className="size-5" aria-hidden="true" />
          {t('editProfile.title')}
        </CardTitle>
        <CardDescription>{t('editProfile.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-display-name">
              {t('editProfile.displayNameLabel')}
            </Label>
            <Input
              id="edit-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isSaving}
              autoComplete="nickname"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-username">
              {t('editProfile.usernameLabel')}
            </Label>
            <Input
              id="edit-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSaving}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-country">{t('editProfile.countryLabel')}</Label>
            <Select value={country} onValueChange={setCountry} disabled={isSaving}>
              <SelectTrigger id="edit-country" className="w-full" aria-describedby="edit-country-hint">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NO_COUNTRY}>{t('editProfile.countryNone')}</SelectItem>
                {countryOptions.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="edit-country-hint" className="text-xs text-muted-foreground">
              {t('editProfile.countryHint')}
            </p>
          </div>

          <Button type="submit" disabled={isSaving || !isDirty} className="w-full sm:w-auto">
            {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isSaving ? t('editProfile.saving') : t('editProfile.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
