import { useState, type FormEvent } from 'react'
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
import { UserPen, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { userApi, UserApiError } from '@/lib/api/user'
import type { User } from '@the-box/types'

interface EditProfileCardProps {
  displayName: string
  username: string
  // Called with the updated User so the parent can refresh its cached profile.
  onUpdated?: (user: User) => void
}

/**
 * Lets the user edit their display name and username. Submits to
 * PUT /api/user/profile and surfaces field-specific errors (taken username,
 * invalid formats) as toasts.
 */
export function EditProfileCard({
  displayName: initialDisplayName,
  username: initialUsername,
  onUpdated,
}: EditProfileCardProps) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [username, setUsername] = useState(initialUsername)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty =
    displayName !== initialDisplayName || username !== initialUsername

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isSaving || !isDirty) return
    setIsSaving(true)
    try {
      const updated = await userApi.updateProfile({ displayName, username })
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
          <UserPen className="size-5" />
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
              autoComplete="off"
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
            />
          </div>

          <Button type="submit" disabled={isSaving || !isDirty}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            {isSaving ? t('editProfile.saving') : t('editProfile.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
