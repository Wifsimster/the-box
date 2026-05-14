# @the-box/marketing-video

Remotion compositions for The Box marketing assets. Two compositions are
registered:

| ID                   | Aspect | Resolution  | Duration       | Use case                |
| -------------------- | ------ | ----------- | -------------- | ----------------------- |
| `the-box-marketing`  | 16:9   | 1920 × 1080 | 30 s (900 f)   | Landing page hero, ads  |
| `the-box-short`      | 9:16   | 1080 × 1920 | 12 s (360 f)   | TikTok / Reels / Shorts |

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

## Layout

```
src/
├── index.ts              # registerRoot()
├── Root.tsx              # <Composition /> registrations
├── theme.ts              # Brand tokens (mirrors frontend neon palette)
├── MarketingVideo.tsx    # 30s landscape composition (TransitionSeries)
├── ShortVideo.tsx        # 12s vertical composition
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
