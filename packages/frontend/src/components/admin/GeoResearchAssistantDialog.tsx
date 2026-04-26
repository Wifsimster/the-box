import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ExternalLink, Sparkles } from 'lucide-react'

// Surfaced from the GeoMapsTab side panel when a curated game still has no
// active map. Saves the admin from typing the same six search URLs by hand
// every time a tier-cascade run whiffs. Each link opens in a new tab,
// pre-filled with the game's name or kebab-case slug.

interface ResearchSource {
    key: string
    label: string
    description: string
    url: (gameName: string, slug: string) => string
}

const SOURCES: ResearchSource[] = [
    {
        key: 'google',
        label: 'Google Images',
        description: 'Broad image search — fastest path to "is there ANY map".',
        url: (name) =>
            `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${name} world map`)}`,
    },
    {
        key: 'strategywiki',
        label: 'StrategyWiki',
        description: 'CC-BY-SA wiki with structured /Maps subpages.',
        url: (name) =>
            `https://strategywiki.org/w/index.php?search=${encodeURIComponent(name)}`,
    },
    {
        key: 'fextralife',
        label: 'Fextralife wiki',
        description: 'Best signal for Soulsborne / RPG / open-world titles.',
        url: (_name, slug) => {
            // Fextralife uses compact alphanumeric subdomains. Best-effort.
            const compact = slug.replace(/[^a-z0-9]+/gi, '').toLowerCase()
            return compact
                ? `https://${compact}.wiki.fextralife.com/Interactive+Map`
                : 'https://fextralife.com/wikis/'
        },
    },
    {
        key: 'mapgenie',
        label: 'Map Genie',
        description: 'High-quality Leaflet maps; check the og:image preview.',
        url: (_name, slug) => `https://mapgenie.io/${slug}`,
    },
    {
        key: 'commons',
        label: 'Wikimedia Commons',
        description: 'License-clean maps; filter by Category:Maps_of_<Game>.',
        url: (name) =>
            `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(`Map of ${name}`)}&title=Special:MediaSearch&go=Go&type=image`,
    },
    {
        key: 'reddit',
        label: 'Reddit',
        description: 'Fan-uploaded HD maps; image posts only.',
        url: (name) =>
            `https://www.reddit.com/search/?q=${encodeURIComponent(`${name} world map`)}&type=link&sort=top&t=all`,
    },
]

interface GeoResearchAssistantDialogProps {
    isOpen: boolean
    onClose: () => void
    game: { id: number; name: string; slug: string } | null
    onPickManualUpload: () => void
}

export function GeoResearchAssistantDialog({
    isOpen,
    onClose,
    game,
    onPickManualUpload,
}: GeoResearchAssistantDialogProps) {
    const { t } = useTranslation()
    if (!game) return null
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Sparkles className="h-4 w-4 text-neon-pink" aria-hidden />
                        {t('admin.geo.research.title', { name: game.name })}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {t('admin.geo.research.description')}
                    </DialogDescription>
                </DialogHeader>

                <ul className="space-y-1.5">
                    {SOURCES.map((s) => (
                        <li key={s.key}>
                            <a
                                href={s.url(game.name, game.slug)}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="group flex items-start gap-2 rounded-md border border-border/40 bg-muted/10 p-2.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                            >
                                <ExternalLink
                                    className="mt-0.5 h-3.5 w-3.5 text-muted-foreground group-hover:text-primary"
                                    aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium">{s.label}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {s.description}
                                    </p>
                                </div>
                            </a>
                        </li>
                    ))}
                </ul>

                <div className="flex flex-col gap-2 border-t border-border/40 pt-3 sm:flex-row">
                    <Button
                        size="sm"
                        variant="default"
                        className="flex-1"
                        onClick={() => {
                            onClose()
                            onPickManualUpload()
                        }}
                    >
                        {t('admin.geo.research.pasteUrlCta')}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={onClose}
                    >
                        {t('admin.geo.research.close')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
