import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'

// Copy-paste integration recipes — the fourth Streamer Kit section, below
// webhooks. Builds three ready-to-paste snippets (Nightbot chat command, OBS
// overlay, webhook) from the streamer's own slug, so the in-app panel matches
// what docs/streamer-kit.html shows. Rendered by StreamerKitCard only when the
// public profile is enabled.

interface Props {
  // The saved public slug, or null if the streamer hasn't claimed one yet.
  slug: string | null
}

type RecipeId = 'chat' | 'overlay' | 'webhook'

export function StreamerRecipesSection({ slug }: Props) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<RecipeId | null>(null)

  // The public API is served from the app's own origin (Node serves both in
  // production; the dev server proxies /api). Deriving the base from the live
  // origin keeps the snippets correct in every environment.
  const base = `${window.location.origin}/api/public/v1`
  const effectiveSlug = slug || 'YOUR_SLUG'

  const recipes: { id: RecipeId; title: string; desc: string; code: string }[] = [
    {
      id: 'chat',
      title: t('streamerKit.recipeChatTitle'),
      desc: t('streamerKit.recipeChatDesc'),
      code: `!commands add !box $(urlfetch ${base}/streamers/${effectiveSlug}?format=chat)`,
    },
    {
      id: 'overlay',
      title: t('streamerKit.recipeOverlayTitle'),
      desc: t('streamerKit.recipeOverlayDesc'),
      code: [
        '<!-- Drop into an OBS Browser Source -->',
        '<div id="score">—</div>',
        '<script>',
        "  const KEY = 'YOUR_KEY'",
        '  const es = new EventSource(',
        `    '${base}/streamers/${effectiveSlug}/live?key=' + KEY`,
        '  )',
        "  es.addEventListener('screenshot.scored', (e) => {",
        '    const s = JSON.parse(e.data)',
        "    document.getElementById('score').textContent =",
        "      s.score + ' pts · ' + s.screenshotsDone + '/10'",
        '  })',
        "  es.addEventListener('session.completed', (e) => {",
        '    const s = JSON.parse(e.data)',
        "    document.getElementById('score').textContent =",
        "      'Final: ' + s.score + ' pts (#' + s.rank + ')'",
        '  })',
        '</script>',
      ].join('\n'),
    },
    {
      id: 'webhook',
      title: t('streamerKit.recipeWebhookTitle'),
      desc: t('streamerKit.recipeWebhookDesc'),
      code: [
        `curl -X POST ${base}/webhooks \\`,
        '  -H "Authorization: Bearer YOUR_KEY" \\',
        '  -H "Content-Type: application/json" \\',
        `  -d '{"url":"https://hooks.example.com/the-box","label":"Discord bot","events":["session.completed"]}'`,
      ].join('\n'),
    },
  ]

  async function copy(id: RecipeId, code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000)
    } catch {
      toast.error(t('streamerKit.copyError'))
    }
  }

  return (
    <div className="space-y-3" data-testid="streamer-kit-recipes">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <BookOpen className="h-4 w-4" />
        {t('streamerKit.recipesTitle')}
      </h4>
      <p className="text-xs text-muted-foreground">{t('streamerKit.recipesHint')}</p>
      {!slug && (
        <p className="text-xs text-muted-foreground">{t('streamerKit.recipesNeedSlug')}</p>
      )}

      <ul className="space-y-3">
        {recipes.map((r) => (
          <li
            key={r.id}
            data-testid={`streamer-kit-recipe-${r.id}`}
            className="rounded border border-border bg-background/30 p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void copy(r.id, r.code)
                }}
                aria-label={t('streamerKit.recipeCopyAria')}
                data-testid={`streamer-kit-recipe-copy-${r.id}`}
              >
                {copied === r.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <pre className="overflow-x-auto rounded bg-background/60 p-2 text-[11px] leading-relaxed">
              <code className="font-mono">{r.code}</code>
            </pre>
          </li>
        ))}
      </ul>
    </div>
  )
}
