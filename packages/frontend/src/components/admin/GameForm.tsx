import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Game } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, RefreshCw, ImageOff } from 'lucide-react'

const SLUG_RE = /^[a-z0-9-]+$/
const URL_RE = /^https?:\/\/\S+$/i
const YEAR_RE = /^\d{4}$/

// The form holds strings everywhere — text inputs, CSV fields, number-as-text.
// The transform to `Omit<Game, 'id'>` lives in `toGameData` so Zod only
// validates the shape the UI actually produces.
const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .regex(SLUG_RE, 'Lowercase letters, digits and hyphens only'),
  aliases: z.string(),
  releaseYear: z
    .string()
    .refine(
      (v) => v === '' || (YEAR_RE.test(v) && Number(v) >= 1970 && Number(v) <= 2100),
      'Year must be between 1970 and 2100',
    ),
  developer: z.string(),
  publisher: z.string(),
  genres: z.string(),
  platforms: z.string(),
  coverImageUrl: z
    .string()
    .refine((v) => v === '' || URL_RE.test(v.trim()), 'Must be a valid http(s) URL'),
})

type FormValues = z.infer<typeof formSchema>

interface GameFormProps {
  game?: Game | null
  onSubmit: (data: Omit<Game, 'id'>) => Promise<void>
  onCancel: () => void
  onSyncRawg?: () => Promise<void>
  isLoading?: boolean
  isSyncing?: boolean
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function defaults(game?: Game | null): FormValues {
  return {
    name: game?.name ?? '',
    slug: game?.slug ?? '',
    aliases: game?.aliases?.join(', ') ?? '',
    releaseYear: game?.releaseYear?.toString() ?? '',
    developer: game?.developer ?? '',
    publisher: game?.publisher ?? '',
    genres: game?.genres?.join(', ') ?? '',
    platforms: game?.platforms?.join(', ') ?? '',
    coverImageUrl: game?.coverImageUrl ?? '',
  }
}

function toGameData(values: FormValues): Omit<Game, 'id'> {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    aliases: splitCsv(values.aliases),
    releaseYear: values.releaseYear ? parseInt(values.releaseYear, 10) : undefined,
    developer: values.developer.trim() || undefined,
    publisher: values.publisher.trim() || undefined,
    genres: splitCsv(values.genres),
    platforms: splitCsv(values.platforms),
    coverImageUrl: values.coverImageUrl.trim() || undefined,
  }
}

export function GameForm({
  game,
  onSubmit,
  onCancel,
  onSyncRawg,
  isLoading = false,
  isSyncing = false,
}: GameFormProps) {
  const { t } = useTranslation()
  const isEditing = !!game
  const [imageError, setImageError] = useState(false)

  // Using `values` (vs `defaultValues`) makes RHF track the game prop and
  // reset the form automatically when the user switches rows in a
  // master-detail view — no effect needed.
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: defaults(game),
  })

  const handleNameChange = (name: string, onChange: (v: string) => void) => {
    onChange(name)
    // Auto-generate slug only when creating a new game.
    if (!isEditing) {
      form.setValue('slug', slugify(name), { shouldValidate: true, shouldDirty: true })
    }
  }

  const handleSubmit = async (values: FormValues) => {
    await onSubmit(toGameData(values))
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0 pr-8">
        <div className="flex items-center justify-between">
          <CardTitle>
            {isEditing ? t('admin.games.editGame') : t('admin.games.addGame')}
          </CardTitle>
          {isEditing && onSyncRawg && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSyncRawg}
              disabled={isSyncing || isLoading}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isSyncing ? t('admin.games.syncing') : t('admin.games.syncRawg')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.games.form.name')} *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('admin.games.form.namePlaceholder')}
                        disabled={isLoading}
                        onChange={(e) => handleNameChange(e.target.value, field.onChange)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.games.form.slug')} *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('admin.games.form.slugPlaceholder')}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="aliases"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.games.form.aliases')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t('admin.games.form.aliasesPlaceholder')}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <FormField
                control={form.control}
                name="releaseYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.games.form.releaseYear')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        placeholder="2024"
                        min={1970}
                        max={2100}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>{t('admin.games.form.metacritic')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    value={game?.metacritic ?? ''}
                    placeholder="—"
                    disabled
                    className="bg-muted"
                  />
                </FormControl>
              </FormItem>
              <FormField
                control={form.control}
                name="developer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.games.form.developer')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Studio Name" disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="publisher"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.games.form.publisher')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Publisher Name" disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="genres"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.games.form.genres')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('admin.games.form.genresPlaceholder')}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="platforms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.games.form.platforms')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('admin.games.form.platformsPlaceholder')}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="coverImageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.games.form.coverImageUrl')}</FormLabel>
                  <div className="flex gap-4">
                    {/* Image Preview */}
                    <div className="relative w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-muted border border-border">
                      {field.value && !imageError ? (
                        <img
                          src={field.value}
                          alt="Cover preview"
                          className="w-full h-full object-cover"
                          onError={() => setImageError(true)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <ImageOff className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <FormControl>
                        <Input
                          {...field}
                          type="url"
                          placeholder="https://example.com/cover.jpg"
                          disabled={isLoading}
                          onChange={(e) => {
                            field.onChange(e)
                            setImageError(false)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                  </div>
                </FormItem>
              )}
            />

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
        </Form>
      </CardContent>
    </Card>
  )
}
