import { useState, useEffect, useMemo, useCallback, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@/types'
import { useAdminStore } from '@/stores/adminStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { UserCard, UserTableRow, type UserActionKind } from './UserListRow'
import { UserActionDialogs } from './UserActionDialogs'
import { useUserActions } from './useUserActions'
import { Search, Loader2, ArrowUpDown, ArrowUp } from 'lucide-react'
import { m, AnimatePresence } from 'framer-motion'

function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

function UserSortIcon({ field, sortField, sortOrder }: { field: string; sortField: string; sortOrder: 'asc' | 'desc' }) {
  if (sortField !== field) {
    return <ArrowUpDown className="ml-1 size-4 opacity-50" />
  }
  return (
    <m.span
      initial={{ rotate: 0 }}
      animate={{ rotate: sortOrder === 'asc' ? 0 : 180 }}
      transition={{ duration: 0.2 }}
    >
      <ArrowUp className="ml-1 size-4" />
    </m.span>
  )
}

function UserSortableHeader({
  field,
  children,
  sortField,
  sortOrder,
  onSort,
}: {
  field: string
  children: React.ReactNode
  sortField: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
}) {
  return (
    <TableHead>
      <button
        type="button"
        className="flex items-center font-medium hover:text-foreground transition-colors"
        onClick={() => onSort(field)}
      >
        {children}
        <UserSortIcon field={field} sortField={sortField} sortOrder={sortOrder} />
      </button>
    </TableHead>
  )
}

// At most one user-action confirmation is pending at a time, so the five
// confirmation targets (delete/ban/unban/grant/revoke) plus the in-flight role
// change are one mutually-exclusive slice rather than six independent flags.
type PendingAction =
  | { kind: 'delete' | 'ban' | 'unban' | 'grant' | 'revoke'; user: User }
  | { kind: 'role'; user: User; newRole: string }
  | null

type PendingActionEvent =
  | { type: 'open'; kind: 'delete' | 'ban' | 'unban' | 'grant' | 'revoke'; user: User }
  | { type: 'roleChange'; user: User; newRole: string }
  | { type: 'close' }

function pendingActionReducer(_state: PendingAction, event: PendingActionEvent): PendingAction {
  switch (event.type) {
    case 'open':
      return { kind: event.kind, user: event.user }
    case 'roleChange':
      return { kind: 'role', user: event.user, newRole: event.newRole }
    case 'close':
      return null
  }
}

export function UserList() {
  const { t } = useTranslation()
  const {
    users,
    usersLoading,
    usersError,
    usersPagination,
    usersSearch,
    usersSort,
    usersBilling,
    fetchUsers,
    setUsersSearch,
    setUsersSort,
    setUsersPage,
  } = useAdminStore()

  const [pendingAction, dispatchAction] = useReducer(pendingActionReducer, null)
  const deletingUser = pendingAction?.kind === 'delete' ? pendingAction.user : null
  const banningUser = pendingAction?.kind === 'ban' ? pendingAction.user : null
  const unbanningUser = pendingAction?.kind === 'unban' ? pendingAction.user : null
  const grantingUser = pendingAction?.kind === 'grant' ? pendingAction.user : null
  const revokingUser = pendingAction?.kind === 'revoke' ? pendingAction.user : null
  const [searchInput, setSearchInput] = useState(usersSearch)

  const closePendingAction = useCallback(() => dispatchAction({ type: 'close' }), [])
  const {
    isSubmitting,
    handleRoleChange,
    handleBan,
    handleUnban,
    handleDelete,
    handleGrant,
    handleRevoke,
  } = useUserActions({
    banningUser,
    unbanningUser,
    deletingUser,
    grantingUser,
    revokingUser,
    onSettled: closePendingAction,
  })

  // Debounced search
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        setUsersSearch(value)
        fetchUsers({ search: value, page: 1 })
      }, 300),
    [setUsersSearch, fetchUsers]
  )

  // Fetch users on mount
  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    debouncedSearch(value)
  }

  // Handle sort change
  const handleSort = useCallback(
    (field: string) => {
      const newOrder =
        usersSort.field === field && usersSort.order === 'asc' ? 'desc' : 'asc'
      setUsersSort(field, newOrder)
    },
    [usersSort, setUsersSort]
  )

  const totalPages = Math.ceil(usersPagination.total / usersPagination.limit)

  // Map a row's action button to the matching confirmation dialog.
  const handleRowAction = (kind: UserActionKind, user: User) => {
    dispatchAction({ type: 'open', kind, user })
  }

  // The role <Select> fires immediately (no confirmation step); record the
  // pending change for in-flight UI, then run the mutation.
  const handleRoleSelect = (user: User, newRole: string) => {
    dispatchAction({ type: 'roleChange', user, newRole })
    void handleRoleChange(user, newRole)
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-y-0">
        <CardTitle className="flex items-center gap-2">
          {t('admin.users.title')}
          {usersPagination.total > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({usersPagination.total})
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('admin.users.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Error state */}
        {usersError && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {usersError}
          </div>
        )}

        {/* Loading state */}
        {usersLoading && users.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">{t('admin.users.noUsers')}</p>
          </div>
        ) : (
          /* Table (md+) / Cards (mobile) */
          <>
            <div className="relative">
              {usersLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                <AnimatePresence mode="popLayout">
                  {users.map((user, index) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      index={index}
                      entitlement={usersBilling[user.id]}
                      isSubmitting={isSubmitting}
                      onAction={handleRowAction}
                      onRoleChange={handleRoleSelect}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* Table (md+) */}
              <div className="hidden md:block rounded-lg border border-white/10 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-white/10">
                      <UserSortableHeader field="email" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.email')}</UserSortableHeader>
                      <UserSortableHeader field="displayName" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.name')}</UserSortableHeader>
                      <UserSortableHeader field="role" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.roleLabel')}</UserSortableHeader>
                      <UserSortableHeader field="totalScore" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.totalScore')}</UserSortableHeader>
                      <UserSortableHeader field="currentStreak" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.currentStreak')}</UserSortableHeader>
                      <UserSortableHeader field="createdAt" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.createdAt')}</UserSortableHeader>
                      <UserSortableHeader field="lastLoginAt" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.lastLoginAt')}</UserSortableHeader>
                      <TableHead>{t('admin.users.premium.label')}</TableHead>
                      <TableHead className="text-right">{t('admin.users.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {users.map((user, index) => (
                        <UserTableRow
                          key={user.id}
                          user={user}
                          index={index}
                          entitlement={usersBilling[user.id]}
                          isSubmitting={isSubmitting}
                          onAction={handleRowAction}
                          onRoleChange={handleRoleSelect}
                        />
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination
                  currentPage={usersPagination.page}
                  totalPages={totalPages}
                  onPageChange={setUsersPage}
                />
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={!!deletingUser}
        onClose={() => dispatchAction({ type: 'close' })}
        onConfirm={handleDelete}
        title={t('admin.users.deleteUser')}
        description={
          deletingUser
            ? t('admin.users.confirmDelete', { email: deletingUser.email })
            : ''
        }
        isLoading={isSubmitting}
      />

      <UserActionDialogs
        banningUser={banningUser}
        unbanningUser={unbanningUser}
        grantingUser={grantingUser}
        revokingUser={revokingUser}
        isSubmitting={isSubmitting}
        onClose={() => dispatchAction({ type: 'close' })}
        onBan={handleBan}
        onUnban={handleUnban}
        onGrant={handleGrant}
        onRevoke={handleRevoke}
      />
    </Card>
  )
}
