import { useTranslation } from 'react-i18next'
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
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-1 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-1 h-4 w-4" />
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
    <Table>
      <TableHeader>
        <TableRow>
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
        {games.map((game) => (
          <TableRow key={game.id}>
            <TableCell className="font-medium">{game.name}</TableCell>
            <TableCell className="text-muted-foreground">{game.slug}</TableCell>
            <TableCell>{game.releaseYear || '-'}</TableCell>
            <TableCell>{game.developer || '-'}</TableCell>
            <TableCell>{game.metacritic ?? '-'}</TableCell>
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
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onViewScreenshots(game)}
                  title={t('admin.games.viewScreenshots')}
                >
                  <Image className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(game)}
                  title={t('admin.games.editGame')}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(game)}
                  className="text-destructive hover:text-destructive"
                  title={t('admin.games.deleteGame')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
