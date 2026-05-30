import { useTranslation } from 'react-i18next'
import { m, AnimatePresence } from 'framer-motion'
import type { Game } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, ArrowUpDown, ArrowUp, Image } from 'lucide-react'
import { tableRow } from '@/lib/animations'

interface GameTableProps {
  games: Game[]
  onEdit: (game: Game) => void
  onDelete: (game: Game) => void
  onViewScreenshots: (game: Game) => void
  sortField: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
}

function SortIcon({ field, sortField, sortOrder }: { field: string; sortField: string; sortOrder: 'asc' | 'desc' }) {
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

function SortableHeader({
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
        <SortIcon field={field} sortField={sortField} sortOrder={sortOrder} />
      </button>
    </TableHead>
  )
}

export function GameTable({
  games,
  onEdit,
  onDelete,
  onViewScreenshots,
  sortField,
  sortOrder,
  onSort,
}: GameTableProps) {
  const { t } = useTranslation()

  const metacriticClass = (score: number) =>
    score >= 75 ? 'text-success/80' : score >= 50 ? 'text-warning/80' : 'text-error/80'

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        <AnimatePresence mode="popLayout">
          {games.map((game, index) => (
            <m.div
              key={game.id}
              variants={tableRow}
              initial="initial"
              animate="animate"
              exit="exit"
              custom={index}
              layout
              transition={{ delay: index * 0.02 }}
              className="rounded-lg border border-white/10 bg-card/50 p-3 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <h3 className="font-medium text-sm truncate">{game.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{game.slug}</p>
                </div>
                {game.metacritic != null && (
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums ${metacriticClass(game.metacritic)}`}
                    aria-label={t('admin.games.table.metacritic')}
                  >
                    {game.metacritic}
                  </span>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-0.5 min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('admin.games.table.releaseYear')}
                  </dt>
                  <dd className="tabular-nums">{game.releaseYear || '-'}</dd>
                </div>
                <div className="space-y-0.5 min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('admin.games.table.developer')}
                  </dt>
                  <dd className="truncate">{game.developer || '-'}</dd>
                </div>
                <div className="col-span-2 space-y-0.5 min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('admin.games.table.genres')}
                  </dt>
                  <dd className="text-muted-foreground truncate">
                    {game.genres?.length
                      ? `${game.genres.slice(0, 2).join(', ')}${game.genres.length > 2 ? ` +${game.genres.length - 2}` : ''}`
                      : '-'}
                  </dd>
                </div>
              </dl>

              <div className="flex justify-end gap-1 pt-1 border-t border-white/5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onViewScreenshots(game)}
                  title={t('admin.games.viewScreenshots')}
                  className="hover:bg-primary/20 hover:text-primary/70"
                >
                  <Image className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(game)}
                  title={t('admin.games.editGame')}
                  className="hover:bg-neon-blue/20 hover:text-neon-blue/70"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(game)}
                  className="text-destructive hover:text-destructive hover:bg-error/20"
                  title={t('admin.games.deleteGame')}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </m.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Table (md+) */}
      <div className="hidden md:block rounded-lg border border-white/10 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-white/10">
              <SortableHeader field="name" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>{t('admin.games.table.name')}</SortableHeader>
              <SortableHeader field="slug" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>{t('admin.games.table.slug')}</SortableHeader>
              <SortableHeader field="releaseYear" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>{t('admin.games.table.releaseYear')}</SortableHeader>
              <SortableHeader field="developer" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>{t('admin.games.table.developer')}</SortableHeader>
              <SortableHeader field="metacritic" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>{t('admin.games.table.metacritic')}</SortableHeader>
              <TableHead>{t('admin.games.table.genres')}</TableHead>
              <TableHead className="text-right">{t('admin.games.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {games.map((game, index) => (
                <m.tr
                  key={game.id}
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
                    {game.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{game.slug}</TableCell>
                  <TableCell>{game.releaseYear || '-'}</TableCell>
                  <TableCell>{game.developer || '-'}</TableCell>
                  <TableCell>
                    {game.metacritic != null ? (
                      <span className={metacriticClass(game.metacritic)}>{game.metacritic}</span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {game.genres?.length ? (
                      <span className="text-sm text-muted-foreground">
                        {game.genres.slice(0, 2).join(', ')}
                        {game.genres.length > 2 && ` +${game.genres.length - 2}`}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <m.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onViewScreenshots(game)}
                          title={t('admin.games.viewScreenshots')}
                          className="hover:bg-primary/20 hover:text-primary/70"
                        >
                          <Image className="size-4" />
                        </Button>
                      </m.div>
                      <m.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(game)}
                          title={t('admin.games.editGame')}
                          className="hover:bg-neon-blue/20 hover:text-neon-blue/70"
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </m.div>
                      <m.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(game)}
                          className="text-destructive hover:text-destructive hover:bg-error/20"
                          title={t('admin.games.deleteGame')}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </m.div>
                    </div>
                  </TableCell>
                </m.tr>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </>
  )
}
