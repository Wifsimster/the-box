import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@/types'
import { useAdminStore } from '@/stores/adminStore'
import { toast } from '@/lib/toast'

interface UseUserActionsArgs {
  banningUser: User | null
  unbanningUser: User | null
  deletingUser: User | null
  grantingUser: User | null
  revokingUser: User | null
  /** Close the pending-action dialog once a mutation settles. */
  onSettled: () => void
}

/**
 * Encapsulates the role/ban/unban/delete/grant/revoke mutations plus the shared
 * `isSubmitting` flag and toast handling, so the UserList component stays focused
 * on layout. Each handler returns after closing the dialog on success.
 */
export function useUserActions({
  banningUser,
  unbanningUser,
  deletingUser,
  grantingUser,
  revokingUser,
  onSettled,
}: UseUserActionsArgs) {
  const { t } = useTranslation()
  const { setUserRole, banUser, unbanUser, deleteUser, grantSupporter, revokeSupporter } =
    useAdminStore()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleRoleChange = async (user: User, newRole: string) => {
    if (user.isAdmin === (newRole === 'admin')) return // No change needed

    setIsSubmitting(true)
    try {
      await setUserRole(user.id, newRole)
      toast.success(t('admin.users.messages.roleUpdated'))
    } catch {
      toast.error(t('admin.users.messages.roleUpdateError'))
    } finally {
      setIsSubmitting(false)
      onSettled()
    }
  }

  const handleBan = async () => {
    if (!banningUser) return
    setIsSubmitting(true)
    try {
      await banUser(banningUser.id)
      toast.success(t('admin.users.messages.banned'))
      onSettled()
    } catch {
      toast.error(t('admin.users.messages.banError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUnban = async () => {
    if (!unbanningUser) return
    setIsSubmitting(true)
    try {
      await unbanUser(unbanningUser.id)
      toast.success(t('admin.users.messages.unbanned'))
      onSettled()
    } catch {
      toast.error(t('admin.users.messages.unbanError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingUser) return
    setIsSubmitting(true)
    try {
      await deleteUser(deletingUser.id)
      toast.success(t('admin.users.messages.deleted'))
      onSettled()
    } catch {
      toast.error(t('admin.users.messages.deleteError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGrant = async () => {
    if (!grantingUser) return
    setIsSubmitting(true)
    try {
      await grantSupporter(grantingUser.id)
      toast.success(t('admin.users.messages.granted'))
      onSettled()
    } catch {
      toast.error(t('admin.users.messages.grantError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokingUser) return
    setIsSubmitting(true)
    try {
      await revokeSupporter(revokingUser.id)
      toast.success(t('admin.users.messages.revoked'))
      onSettled()
    } catch {
      toast.error(t('admin.users.messages.revokeError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    isSubmitting,
    handleRoleChange,
    handleBan,
    handleUnban,
    handleDelete,
    handleGrant,
    handleRevoke,
  }
}
