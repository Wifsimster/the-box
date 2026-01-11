import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Game } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

interface GameFormProps {
  game?: Game | null
  onSubmit: (data: Omit<Game, 'id'>) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export function GameForm({ game, onSubmit, onCancel, isLoading = false }: GameFormProps) {
  const { t } = useTranslation()
  const isEditing = !!game

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    aliases: '',
    releaseYear: '',
    developer: '',
    publisher: '',
    genres: '',
    platforms: '',
    coverImageUrl: '',
  })

  useEffect(() => {
    if (game) {
      setFormData({
        name: game.name,
        slug: game.slug,
        aliases: game.aliases?.join(', ') || '',
        releaseYear: game.releaseYear?.toString() || '',
        developer: game.developer || '',
        publisher: game.publisher || '',
        genres: game.genres?.join(', ') || '',
        platforms: game.platforms?.join(', ') || '',
        coverImageUrl: game.coverImageUrl || '',
      })
    }
  }, [game])

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      // Auto-generate slug only when creating new game
      slug: !isEditing ? slugify(name) : prev.slug,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const data: Omit<Game, 'id'> = {
      name: formData.name.trim(),
      slug: formData.slug.trim(),
      aliases: formData.aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      releaseYear: formData.releaseYear ? parseInt(formData.releaseYear) : undefined,
      developer: formData.developer.trim() || undefined,
      publisher: formData.publisher.trim() || undefined,
      genres: formData.genres
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean),
      platforms: formData.platforms
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      coverImageUrl: formData.coverImageUrl.trim() || undefined,
    }

    await onSubmit(data)
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle>
          {isEditing ? t('admin.games.editGame') : t('admin.games.addGame')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.games.form.name')} *</label>
              <Input
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={t('admin.games.form.namePlaceholder')}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.games.form.slug')} *</label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder={t('admin.games.form.slugPlaceholder')}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('admin.games.form.aliases')}</label>
            <Input
              value={formData.aliases}
              onChange={(e) => setFormData((prev) => ({ ...prev, aliases: e.target.value }))}
              placeholder={t('admin.games.form.aliasesPlaceholder')}
              disabled={isLoading}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.games.form.releaseYear')}</label>
              <Input
                type="number"
                value={formData.releaseYear}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, releaseYear: e.target.value }))
                }
                placeholder="2024"
                min={1970}
                max={2100}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.games.form.developer')}</label>
              <Input
                value={formData.developer}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, developer: e.target.value }))
                }
                placeholder="Studio Name"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.games.form.publisher')}</label>
              <Input
                value={formData.publisher}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, publisher: e.target.value }))
                }
                placeholder="Publisher Name"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.games.form.genres')}</label>
              <Input
                value={formData.genres}
                onChange={(e) => setFormData((prev) => ({ ...prev, genres: e.target.value }))}
                placeholder={t('admin.games.form.genresPlaceholder')}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.games.form.platforms')}</label>
              <Input
                value={formData.platforms}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, platforms: e.target.value }))
                }
                placeholder={t('admin.games.form.platformsPlaceholder')}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('admin.games.form.coverImageUrl')}</label>
            <Input
              type="url"
              value={formData.coverImageUrl}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, coverImageUrl: e.target.value }))
              }
              placeholder="https://example.com/cover.jpg"
              disabled={isLoading}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="gaming" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
