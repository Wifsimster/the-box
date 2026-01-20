import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@/types'
import { useAdminStore } from '@/stores/adminStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pagination } from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { Search, Loader2, ArrowUpDown, ArrowUp, Trash2, Ban, Unlock } from 'lucide-react'
import { toast } from '@/lib/toast'
import { motion, AnimatePresence } from 'framer-motion'
import { tableRow } from '@/lib/animations'

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
    return <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
  }
  return (
    <motion.span
      initial={{ rotate: 0 }}
      animate={{ rotate: sortOrder === 'asc' ? 0 : 180 }}
      transition={{ duration: 0.2 }}
    >
      <ArrowUp className="ml-1 h-4 w-4" />
    </motion.span>
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
        className="flex items-center font-medium hover:text-foreground transition-colors"
        onClick={() => onSort(field)}
      >
        {children}
        <UserSortIcon field={field} sortField={sortField} sortOrder={sortOrder} />
      </button>
    </TableHead>
  )
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
    fetchUsers,
    setUsersSearch,
    setUsersSort,
    setUsersPage,
    setUserRole,
    banUser,
    unbanUser,
    deleteUser,
  } = useAdminStore()

  const [deletingUser, setDeletingUser] = useState<User | null>(null)
  const [banningUser, setBanningUser] = useState<User | null>(null)
  const [unbanningUser, setUnbanningUser] = useState<User | null>(null)
  const [, setRoleChangingUser] = useState<{ user: User; newRole: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchInput, setSearchInput] = useState(usersSearch)

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

  // Handle role change
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
      setRoleChangingUser(null)
    }
  }

  // Handle ban
  const handleBan = async () => {
    if (!banningUser) return
    setIsSubmitting(true)
    try {
      await banUser(banningUser.id)
      toast.success(t('admin.users.messages.banned'))
      setBanningUser(null)
    } catch {
      toast.error(t('admin.users.messages.banError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle unban
  const handleUnban = async () => {
    if (!unbanningUser) return
    setIsSubmitting(true)
    try {
      await unbanUser(unbanningUser.id)
      toast.success(t('admin.users.messages.unbanned'))
      setUnbanningUser(null)
    } catch {
      toast.error(t('admin.users.messages.unbanError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!deletingUser) return
    setIsSubmitting(true)
    try {
      await deleteUser(deletingUser.id)
      toast.success(t('admin.users.messages.deleted'))
      setDeletingUser(null)
    } catch {
      toast.error(t('admin.users.messages.deleteError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalPages = Math.ceil(usersPagination.total / usersPagination.limit)

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString()
    } catch {
      return dateString
    }
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">{t('admin.users.noUsers')}</p>
          </div>
        ) : (
          /* Table */
          <>
            <div className="relative">
              {usersLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <div className="rounded-lg border border-white/10 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-white/10">
                      <UserSortableHeader field="email" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.email')}</UserSortableHeader>
                      <UserSortableHeader field="displayName" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.name')}</UserSortableHeader>
                      <UserSortableHeader field="role" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.roleLabel')}</UserSortableHeader>
                      <UserSortableHeader field="totalScore" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.totalScore')}</UserSortableHeader>
                      <UserSortableHeader field="currentStreak" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.currentStreak')}</UserSortableHeader>
                      <UserSortableHeader field="createdAt" sortField={usersSort.field} sortOrder={usersSort.order} onSort={handleSort}>{t('admin.users.createdAt')}</UserSortableHeader>
                      <TableHead className="text-right">{t('admin.users.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {users.map((user, index) => (
                        <motion.tr
                          key={user.id}
                          variants={tableRow}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          custom={index}
                          layout
                          transition={{ delay: index * 0.02 }}
                          className="border-b border-white/5 transition-colors group"
                          whileHover={{
                            backgroundColor: 'oklch(0.25 0.04 280 / 0.3)',
                          }}
                        >
                          <TableCell className="font-medium group-hover:text-purple-300 transition-colors">
                            {user.email}
                            {user.isGuest && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({t('admin.users.guest')})
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{user.displayName || user.username}</TableCell>
                          <TableCell>
                            <select
                              value={user.isAdmin ? 'admin' : 'user'}
                              onChange={(e) => {
                                setRoleChangingUser({ user, newRole: e.target.value })
                                handleRoleChange(user, e.target.value)
                              }}
                              disabled={isSubmitting}
                              className="bg-background border border-white/10 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            >
                              <option value="user">{t('admin.users.role.user')}</option>
                              <option value="admin">{t('admin.users.role.admin')}</option>
                            </select>
                          </TableCell>
                          <TableCell>{(user.totalScore ?? 0).toLocaleString()}</TableCell>
                          <TableCell>{user.currentStreak ?? 0}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(user.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                              {user.isAdmin ? (
                                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setUnbanningUser(user)}
                                    title={t('admin.users.unbanUser')}
                                    className="hover:bg-green-500/20 hover:text-green-300"
                                  >
                                    <Unlock className="h-4 w-4" />
                                  </Button>
                                </motion.div>
                              ) : (
                                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setBanningUser(user)}
                                    title={t('admin.users.banUser')}
                                    className="hover:bg-orange-500/20 hover:text-orange-300"
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                </motion.div>
                              )}
                              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeletingUser(user)}
                                  className="text-destructive hover:text-destructive hover:bg-red-500/20"
                                  title={t('admin.users.deleteUser')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </motion.div>
                            </div>
                          </TableCell>
                        </motion.tr>
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
        onClose={() => setDeletingUser(null)}
        onConfirm={handleDelete}
        title={t('admin.users.deleteUser')}
        description={
          deletingUser
            ? t('admin.users.confirmDelete', { email: deletingUser.email })
            : ''
        }
        isLoading={isSubmitting}
      />

      {/* Ban Confirmation Dialog */}
      <Dialog open={!!banningUser} onOpenChange={(open) => !open && setBanningUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.banUser')}</DialogTitle>
            <DialogDescription>
              {banningUser && t('admin.users.confirmBan', { email: banningUser.email })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanningUser(null)} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleBan} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('admin.users.banUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unban Confirmation Dialog */}
      <Dialog open={!!unbanningUser} onOpenChange={(open) => !open && setUnbanningUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.unbanUser')}</DialogTitle>
            <DialogDescription>
              {unbanningUser && t('admin.users.confirmUnban', { email: unbanningUser.email })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnbanningUser(null)} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button variant="default" onClick={handleUnban} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('admin.users.unbanUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
