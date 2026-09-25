# @the-box/marketing-video

Remotion compositions for The Box marketing assets. Four compositions are
registered:

| ID                   | Aspect | Resolution  | Duration       | Use case                |
| -------------------- | ------ | ----------- | -------------- | ----------------------- |
| `the-box-marketing`  | 16:9   | 1920 × 1080 | 30 s (900 f)   | Landing page hero, ads  |
| `the-box-short`      | 9:16   | 1080 × 1920 | 12 s (360 f)   | TikTok / Reels / Shorts |
| `the-box-founder`    | 16:9   | 1920 × 1080 | 19.7 s (590 f) | Founder clip            |
| `the-box-daily-promo`| 9:16   | 1080 × 1920 | 25 s (752 f)   | Facebook / Instagram Reels (FR) |

## Develop

From the repo root:

```bash
npm run dev:video
# or
npm -w @the-box/marketing-video run studio
```

Remotion Studio opens on `http://localhost:3000` (the default port) with
hot reload. Pick a composition from the sidebar to preview.

## Render

Rendering requires headless Chrome — the Remotion CLI downloads it on first
run. From the repo root:

```bash
npm run render:video                                    # 16:9 landscape
npm -w @the-box/marketing-video run render:short        # 9:16 vertical
```

Output lands in `packages/marketing-video/out/`.

### Daily box promo (`the-box-daily-promo`)

French vertical promo: a guessing round (blurred screenshot → typed answer →
✓), the ten-screenshot daily box, the real app in a phone frame, then the CTA.
It uses real game screenshots and real app screens, which are **not
committed** (publishers' copyright, real usernames on the leaderboard). Fetch
them into `public/daily-promo/` first:

```bash
npm -w @the-box/marketing-video run assets:daily-promo -- --shots   # game screenshots only
npm i --no-save playwright-core                                      # needed for the app screens
CHROME_PATH=/path/to/chrome-headless-shell npm -w @the-box/marketing-video run assets:daily-promo
npm -w @the-box/marketing-video run render:daily-promo
```

The composition has no audio: add a track from the platform's library when
publishing.

## Layout

```
src/
├── index.ts              # registerRoot()
├── Root.tsx              # <Composition /> registrations
├── theme.ts              # Brand tokens (mirrors frontend neon palette)
├── MarketingVideo.tsx    # 30s landscape composition (TransitionSeries)
├── ShortVideo.tsx        # 12s vertical composition
├── DailyBoxPromo.tsx     # 25s vertical FR promo (self-contained scenes)
├── components/
│   ├── Cube.tsx          # CSS 3D spinning cube (mirrors logo.svg)
│   ├── GridBackground.tsx
│   ├── GradientText.tsx
│   └── Reveal.tsx        # Spring slide-and-fade wrapper
└── scenes/
    ├── IntroScene.tsx
    ├── HookScene.tsx
    ├── FeatureScene.tsx     # Reused for daily-challenges + hints/achievements
    ├── LeaderboardScene.tsx
    └── CTAScene.tsx
```

## Brand

Colours and fonts in `src/theme.ts` mirror `frontend/src/index.css` —
neon purple `#a855f7`, neon pink `#f472b6`, neon cyan `#06b6d4` on a near-black
`#0a0a0f` backdrop, Inter for display and JetBrains Mono for numbers.

## Adding music

Drop a royalty-free MP3 at `public/soundtrack.mp3` and set
`defaultProps={{ withAudio: true }}` on the `the-box-marketing` composition
in `Root.tsx`. The file is **not** committed.
