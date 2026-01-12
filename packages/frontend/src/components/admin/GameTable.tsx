import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
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
import { Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Image } from 'lucide-react'
import { tableRow, staggerContainerFast } from '@/lib/animations'

interface GameTableProps {
  games: Game[]
  onEdit: (game: Game) => void
  onDelete: (game: Game) => void
  onViewScreenshots: (game: Game) => void
  sortField: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
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

  const SortIcon = ({ field }: { field: string }) => {
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

  const SortableHeader = ({
    field,
    children,
  }: {
    field: string
    children: React.ReactNode
  }) => (
    <TableHead>
      <button
        className="flex items-center font-medium hover:text-foreground transition-colors"
        onClick={() => onSort(field)}
      >
        {children}
        <SortIcon field={field} />
      </button>
    </TableHead>
  )

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-white/10">
            <SortableHeader field="name">{t('admin.games.table.name')}</SortableHeader>
            <SortableHeader field="slug">{t('admin.games.table.slug')}</SortableHeader>
            <SortableHeader field="releaseYear">{t('admin.games.table.releaseYear')}</SortableHeader>
            <SortableHeader field="developer">{t('admin.games.table.developer')}</SortableHeader>
            <SortableHeader field="metacritic">{t('admin.games.table.metacritic')}</SortableHeader>
            <TableHead>{t('admin.games.table.genres')}</TableHead>
            <TableHead className="text-right">{t('admin.games.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence mode="popLayout">
            {games.map((game, index) => (
              <motion.tr
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
                  backgroundColor: 'oklch(0.25 0.04 280 / 0.3)',
                }}
              >
                <TableCell className="font-medium group-hover:text-purple-300 transition-colors">
                  {game.name}
                </TableCell>
                <TableCell className="text-muted-foreground">{game.slug}</TableCell>
                <TableCell>{game.releaseYear || '-'}</TableCell>
                <TableCell>{game.developer || '-'}</TableCell>
                <TableCell>
                  {game.metacritic != null ? (
                    <span
                      className={
                        game.metacritic >= 75
                          ? 'text-green-400'
                          : game.metacritic >= 50
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }
                    >
                      {game.metacritic}
                    </span>
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
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onViewScreenshots(game)}
                        title={t('admin.games.viewScreenshots')}
                        className="hover:bg-purple-500/20 hover:text-purple-300"
                      >
                        <Image className="h-4 w-4" />
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(game)}
                        title={t('admin.games.editGame')}
                        className="hover:bg-blue-500/20 hover:text-blue-300"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(game)}
                        className="text-destructive hover:text-destructive hover:bg-red-500/20"
                        title={t('admin.games.deleteGame')}
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
  )
}
