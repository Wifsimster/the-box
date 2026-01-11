import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Game } from '@/types'
import { useAdminStore } from '@/stores/adminStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Pagination } from '@/components/ui/pagination'
import { GameTable } from './GameTable'
import { GameForm } from './GameForm'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { Plus, Search, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'

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

export function GameList() {
  const { t } = useTranslation()
  const {
    games,
    gamesLoading,
    gamesError,
    gamesPagination,
    gamesSearch,
    gamesSort,
    fetchGames,
    createGame,
    updateGame,
    deleteGame,
    setGamesSearch,
    setGamesSort,
    setGamesPage,
  } = useAdminStore()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [deletingGame, setDeletingGame] = useState<Game | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchInput, setSearchInput] = useState(gamesSearch)

  // Debounced search
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        setGamesSearch(value)
        fetchGames({ search: value, page: 1 })
      }, 300),
    [setGamesSearch, fetchGames]
  )

  // Fetch games on mount
  useEffect(() => {
    fetchGames()
  }, [fetchGames])

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    debouncedSearch(value)
  }

  // Handle sort change
  const handleSort = useCallback(
    (field: string) => {
      const newOrder =
        gamesSort.field === field && gamesSort.order === 'asc' ? 'desc' : 'asc'
      setGamesSort(field, newOrder)
    },
    [gamesSort, setGamesSort]
  )

  // Handle create
  const handleCreate = async (data: Omit<Game, 'id'>) => {
    setIsSubmitting(true)
    try {
      await createGame(data)
      toast.success(t('admin.games.messages.created'))
      setIsFormOpen(false)
    } catch {
      toast.error(t('admin.games.messages.createError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle update
  const handleUpdate = async (data: Omit<Game, 'id'>) => {
    if (!editingGame) return
    setIsSubmitting(true)
    try {
      await updateGame(editingGame.id, data)
      toast.success(t('admin.games.messages.updated'))
      setEditingGame(null)
    } catch {
      toast.error(t('admin.games.messages.updateError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!deletingGame) return
    setIsSubmitting(true)
    try {
      await deleteGame(deletingGame.id)
      toast.success(t('admin.games.messages.deleted'))
      setDeletingGame(null)
    } catch {
      toast.error(t('admin.games.messages.deleteError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Close form dialog
  const handleCloseForm = () => {
    setIsFormOpen(false)
    setEditingGame(null)
  }

  const totalPages = Math.ceil(gamesPagination.total / gamesPagination.limit)

  return (
    <Card className="bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          {t('admin.games.title')}
          {gamesPagination.total > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({gamesPagination.total})
            </span>
          )}
        </CardTitle>
        <Button variant="gaming" onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('admin.games.addGame')}
        </Button>
      </CardHeader>

      <CardContent>
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('admin.games.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Error state */}
        {gamesError && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {gamesError}
          </div>
        )}

        {/* Loading state */}
        {gamesLoading && games.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : games.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">{t('admin.games.noGames')}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setIsFormOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t('admin.games.addGame')}
            </Button>
          </div>
        ) : (
          /* Table */
          <>
            <div className="relative">
              {gamesLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <GameTable
                games={games}
                onEdit={setEditingGame}
                onDelete={setDeletingGame}
                sortField={gamesSort.field}
                sortOrder={gamesSort.order}
                onSort={handleSort}
              />
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination
                  currentPage={gamesPagination.page}
                  totalPages={totalPages}
                  onPageChange={setGamesPage}
                />
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen || !!editingGame} onOpenChange={handleCloseForm}>
        <DialogContent className="max-w-2xl">
          <GameForm
            game={editingGame}
            onSubmit={editingGame ? handleUpdate : handleCreate}
            onCancel={handleCloseForm}
            isLoading={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={!!deletingGame}
        onClose={() => setDeletingGame(null)}
        onConfirm={handleDelete}
        title={t('admin.games.deleteGame')}
        description={
          deletingGame
            ? t('admin.games.deleteConfirm', { name: deletingGame.name })
            : ''
        }
        isLoading={isSubmitting}
      />
    </Card>
  )
}
