import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import type { User, BillingEntitlement } from '@/types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableCell } from '@/components/ui/table'
import { Tooltip } from '@/components/ui/tooltip'
import { Trash2, Ban, Unlock, Crown } from 'lucide-react'
import { tableRow } from '@/lib/animations'
import { PremiumBadge } from './PremiumBadge'

export type UserActionKind = 'delete' | 'ban' | 'unban' | 'grant' | 'revoke'

const identityWrap = (children: React.ReactNode): React.ReactNode => children

export interface UserRowCallbacks {
  onAction: (kind: UserActionKind, user: User) => void
  onRoleChange: (user: User, newRole: string) => void
  isSubmitting: boolean
  entitlement: BillingEntitlement | undefined
}

interface UserRowProps extends UserRowCallbacks {
  user: User
  index: number
}

function useFormatters() {
  const { t, i18n } = useTranslation()
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(i18n.language)
    } catch {
      return dateString
    }
  }
  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return t('admin.users.neverLoggedIn')
    try {
      return new Date(dateString).toLocaleString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateString
    }
  }
  return { formatDate, formatDateTime }
}

/** Premium / ban / delete action buttons shared by the card and table layouts. */
function RowActions({
  user,
  entitlement,
  onAction,
  wrap,
}: {
  user: User
  entitlement: BillingEntitlement | undefined
  onAction: (kind: UserActionKind, user: User) => void
  /** Optional wrapper (e.g. a motion div) applied around each button. */
  wrap?: (children: React.ReactNode) => React.ReactNode
}) {
  const { t } = useTranslation()
  const w = wrap ?? identityWrap
  return (
    <>
      {entitlement?.source === 'supporter' ? (
        <Tooltip content={t('admin.users.revokePremium')}>
          {w(
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onAction('revoke', user)}
              aria-label={t('admin.users.revokePremium')}
              className="hover:text-warning"
            >
              <Crown className="size-4 text-neon-pink" />
            </Button>,
          )}
        </Tooltip>
      ) : (
        <Tooltip content={t('admin.users.grantPremium')}>
          {w(
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onAction('grant', user)}
              aria-label={t('admin.users.grantPremium')}
              className="hover:text-neon-pink"
            >
              <Crown className="size-4" />
            </Button>,
          )}
        </Tooltip>
      )}
      {user.isAdmin ? (
        <Tooltip content={t('admin.users.unbanUser')}>
          {w(
            <Button
              variant="unban"
              size="icon"
              onClick={() => onAction('unban', user)}
              aria-label={t('admin.users.unbanUser')}
            >
              <Unlock className="size-4" />
            </Button>,
          )}
        </Tooltip>
      ) : (
        <Tooltip content={t('admin.users.banUser')}>
          {w(
            <Button
              variant="ban"
              size="icon"
              onClick={() => onAction('ban', user)}
              aria-label={t('admin.users.banUser')}
            >
              <Ban className="size-4" />
            </Button>,
          )}
        </Tooltip>
      )}
      <Tooltip content={t('admin.users.deleteUser')}>
        {w(
          <Button
            variant="dangerGhost"
            size="icon"
            onClick={() => onAction('delete', user)}
            aria-label={t('admin.users.deleteUser')}
          >
            <Trash2 className="size-4" />
          </Button>,
        )}
      </Tooltip>
    </>
  )
}

function RoleSelect({
  user,
  isSubmitting,
  onRoleChange,
  className,
}: {
  user: User
  isSubmitting: boolean
  onRoleChange: (user: User, newRole: string) => void
  className: string
}) {
  const { t } = useTranslation()
  return (
    <Select
      value={user.isAdmin ? 'admin' : 'user'}
      onValueChange={(value) => onRoleChange(user, value)}
      disabled={isSubmitting}
    >
      <SelectTrigger className={className} aria-label={t('admin.users.role.user')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="user">{t('admin.users.role.user')}</SelectItem>
        <SelectItem value="admin">{t('admin.users.role.admin')}</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function UserCard({ user, index, onAction, onRoleChange, isSubmitting, entitlement }: UserRowProps) {
  const { t, i18n } = useTranslation()
  const { formatDate, formatDateTime } = useFormatters()
  return (
    <m.div
      variants={tableRow}
      initial="initial"
      animate="animate"
      exit="exit"
      custom={index}
      layout
      transition={{ delay: index * 0.02 }}
      className="rounded-lg border border-white/10 bg-card/50 p-3 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm break-all">{user.email}</div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {user.displayName || user.username}
            {user.isGuest && <span className="ml-2">({t('admin.users.guest')})</span>}
          </div>
        </div>
        <RoleSelect
          user={user}
          isSubmitting={isSubmitting}
          onRoleChange={onRoleChange}
          className="h-8 w-24 shrink-0"
        />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-0.5">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('admin.users.totalScore')}
          </dt>
          <dd className="font-medium tabular-nums">
            {(user.totalScore ?? 0).toLocaleString(i18n.language)}
          </dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('admin.users.currentStreak')}
          </dt>
          <dd className="font-medium tabular-nums">{user.currentStreak ?? 0}</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('admin.users.createdAt')}
          </dt>
          <dd className="text-muted-foreground">{formatDate(user.createdAt)}</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('admin.users.lastLoginAt')}
          </dt>
          <dd className="text-muted-foreground">{formatDateTime(user.lastLoginAt)}</dd>
        </div>
        <div className="space-y-0.5 col-span-2">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('admin.users.premium.label')}
          </dt>
          <dd>
            <PremiumBadge entitlement={entitlement} />
          </dd>
        </div>
      </dl>

      <div className="flex justify-end gap-1 pt-1 border-t border-white/5">
        <RowActions user={user} entitlement={entitlement} onAction={onAction} />
      </div>
    </m.div>
  )
}

export function UserTableRow({
  user,
  index,
  onAction,
  onRoleChange,
  isSubmitting,
  entitlement,
}: UserRowProps) {
  const { t, i18n } = useTranslation()
  const { formatDate, formatDateTime } = useFormatters()
  return (
    <m.tr
      variants={tableRow}
      initial="initial"
      animate="animate"
      exit="exit"
      custom={index}
      layout
      transition={{ delay: index * 0.02 }}
      className="border-b border-white/5 transition-colors group"
      whileHover={{
        backgroundColor: 'var(--table-row-hover)',
      }}
    >
      <TableCell className="font-medium group-hover:text-primary/70 transition-colors">
        {user.email}
        {user.isGuest && (
          <span className="ml-2 text-xs text-muted-foreground">({t('admin.users.guest')})</span>
        )}
      </TableCell>
      <TableCell>{user.displayName || user.username}</TableCell>
      <TableCell>
        <RoleSelect
          user={user}
          isSubmitting={isSubmitting}
          onRoleChange={onRoleChange}
          className="h-8 w-28"
        />
      </TableCell>
      <TableCell>{(user.totalScore ?? 0).toLocaleString(i18n.language)}</TableCell>
      <TableCell>{user.currentStreak ?? 0}</TableCell>
      <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {formatDateTime(user.lastLoginAt)}
      </TableCell>
      <TableCell>
        <PremiumBadge entitlement={entitlement} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
          <RowActions
            user={user}
            entitlement={entitlement}
            onAction={onAction}
            wrap={(children) => (
              <m.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                {children}
              </m.div>
            )}
          />
        </div>
      </TableCell>
    </m.tr>
  )
}
