import { useTranslation } from 'react-i18next'
import type { GeoMap } from '@the-box/types'
import { Check, X } from 'lucide-react'
import { isPlaceholderImageUrl } from '@/lib/geo-image'
import { cn } from '@/lib/utils'

interface GeoMapChooserProps {
  maps: GeoMap[]
  selectedMapId: number | null
  // The canonical map of the screenshot. Only set after the player has
  // submitted; drives the green check / red X reveal.
  correctMapId: number | null
  // True after submit so cards become non-interactive.
  disabled: boolean
  onSelect: (mapId: number) => void
}

// Multi-map picker — surfaced for the daily challenge whenever a game
// has more than one enabled map. Looks like the Map Genie wiki listing
// (thumbnail + region label per card) and collapses to a single passive
// label on single-map games so the existing Elden Ring flow is unchanged.
export function GeoMapChooser({
  maps,
  selectedMapId,
  correctMapId,
  disabled,
  onSelect,
}: GeoMapChooserProps) {
  const { t } = useTranslation()

  if (maps.length === 0) return null

  // Single-map games: a passive label keeps the layout consistent without
  // demanding a click. The chooser still mounts so the component is the
  // single source of truth for multi-map UX, just not interactive.
  if (maps.length === 1) {
    const only = maps[0]!
    return (
      <div className="flex items-center gap-2 rounded-lg border border-muted/30 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {only.region ?? t('geo.daily.chooseMap.worldFallback', 'World map')}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-foreground">
          {t('geo.daily.chooseMap.title', 'Which map?')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            'geo.daily.chooseMap.hint',
            'Pick the map this screenshot is on, then drop a pin.',
          )}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={t('geo.daily.chooseMap.title', 'Which map?')}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      >
        {maps.map((m) => (
          <MapCard
            key={m.id}
            map={m}
            selected={selectedMapId === m.id}
            correct={correctMapId === m.id}
            wrong={
              correctMapId != null &&
              selectedMapId === m.id &&
              correctMapId !== m.id
            }
            disabled={disabled}
            onSelect={() => onSelect(m.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface MapCardProps {
  map: GeoMap
  selected: boolean
  correct: boolean
  wrong: boolean
  disabled: boolean
  onSelect: () => void
}

function MapCard({ map, selected, correct, wrong, disabled, onSelect }: MapCardProps) {
  const { t } = useTranslation()
  const label = map.region ?? t('geo.daily.chooseMap.worldFallback', 'World map')
  const placeholder = isPlaceholderImageUrl(map.imageUrl)

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-lg border bg-muted/30 text-left transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected
          ? 'border-neon-pink ring-2 ring-neon-pink/60 shadow-[0_0_12px_rgba(236,72,153,0.4)]'
          : 'border-muted/40 hover:border-neon-pink/60',
        disabled && !selected && 'opacity-60',
        disabled && 'cursor-default',
      )}
    >
      {!placeholder ? (
        <img
          src={map.imageUrl}
          alt=""
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          {label}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        <span className="block truncate text-xs font-medium text-white">
          {label}
        </span>
      </div>
      {correct && (
        <div
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-score-high text-white shadow"
          aria-label={t('geo.daily.chooseMap.correct', 'Correct map')}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
        </div>
      )}
      {wrong && (
        <div
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
          aria-label={t('geo.daily.chooseMap.incorrect', 'Wrong map')}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </div>
      )}
    </button>
  )
}
