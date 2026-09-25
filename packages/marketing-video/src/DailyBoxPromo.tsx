import { loadFont } from "@remotion/google-fonts/Inter";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { theme } from "./theme";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "800", "900"],
  subsets: ["latin"],
});

// Alias courts sur theme.ts, plus les couleurs d'état de docs/ui-tokens.md
const C = {
  bg: theme.bg,
  purple: theme.neonPurple,
  pink: theme.neonPink,
  cyan: theme.neonCyan,
  blue: theme.neonBlue,
  green: "#22c55e",
  warning: "#eab308",
  text: theme.textPrimary,
  muted: theme.textMuted,
};
const GRADIENT = `linear-gradient(135deg, ${C.purple}, ${C.pink})`;

const ROUNDS = [
  { img: "daily-promo/shots/hollow-knight_1.jpg", answer: "Hollow Knight", duration: 120, blurIntro: true },
  { img: "daily-promo/shots/elden-ring_4.jpg", answer: "Elden Ring", duration: 56 },
  { img: "daily-promo/shots/mario-kart-8_4.jpg", answer: "Mario Kart 8", duration: 56 },
  { img: "daily-promo/shots/grand-theft-auto-v_4.jpg", answer: "GTA V", duration: 50 },
];
const ROUNDS_DURATION = ROUNDS.reduce((s, r) => s + r.duration, 0);
const BOX_DURATION = 125;
const APP_DURATION = 185;
const CTA_DURATION = 160;

export const PROMO_DURATION =
  ROUNDS_DURATION + BOX_DURATION + APP_DURATION + CTA_DURATION;

const THUMBS = [
  "celeste_1", "elden-ring_1", "grand-theft-auto-v_1", "hades-2018_1", "hollow-knight_4",
  "mario-kart-8_1", "celeste_4", "hades-2018_4", "elden-ring_4", "hollow-knight_1",
];

/* ---------- Briques communes ---------- */

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const a = Math.sin(frame / 60) * 120;
  const b = Math.cos(frame / 75) * 140;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", width: 1100, height: 1100, borderRadius: "50%",
          left: -400 + a, top: -250 + b / 2, filter: "blur(140px)", opacity: 0.45,
          background: C.purple,
        }}
      />
      <div
        style={{
          position: "absolute", width: 1000, height: 1000, borderRadius: "50%",
          right: -420 - a, bottom: -300 + b / 2, filter: "blur(150px)", opacity: 0.35,
          background: C.pink,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          backgroundPosition: `0 ${frame * 0.8}px`,
        }}
      />
    </AbsoluteFill>
  );
};

// Fondu d'entrée/sortie de chaque scène
const SceneFade: React.FC<{ duration: number; children: React.ReactNode }> = ({
  duration,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, duration - 8, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

const GradientText: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <span
    style={{
      backgroundImage: GRADIENT,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      ...style,
    }}
  >
    {children}
  </span>
);

const BoxLogo: React.FC<{ size: number; open: number }> = ({ size, open }) => {
  // open : 0 = fermée, 1 = couvercle levé (logo-open.svg)
  const lift = open * 28;
  const rim = open;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512">
      <defs>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.purple} />
          <stop offset="100%" stopColor={C.pink} />
        </linearGradient>
      </defs>
      <g stroke="url(#edge)" strokeWidth={16} fill="none" strokeLinejoin="round" strokeLinecap="round">
        <polygon points={`256,${80 - lift} 432,${170 - lift} 256,${260 - lift} 80,${170 - lift}`} />
        <g opacity={rim}>
          <line x1="80" y1="170" x2="256" y2="260" />
          <line x1="432" y1="170" x2="256" y2="260" />
        </g>
        <line x1="256" y1="260" x2="256" y2="432" />
        <line x1="80" y1="170" x2="80" y2="342" />
        <line x1="432" y1="170" x2="432" y2="342" />
        <line x1="80" y1="342" x2="256" y2="432" />
        <line x1="256" y1="432" x2="432" y2="342" />
      </g>
    </svg>
  );
};

const TimerRing: React.FC<{ seconds: number; size?: number }> = ({ seconds, size = 150 }) => {
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const progress = seconds / 45;
  const color = seconds > 20 ? C.cyan : seconds > 10 ? C.warning : "#ef4444";
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.12)" strokeWidth={10} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={10} fill="none"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)} strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.34, fontWeight: 800, color: C.text,
        }}
      >
        {Math.ceil(seconds)}s
      </div>
    </div>
  );
};

/* ---------- Scène 1-2 : les manches ---------- */

const Round: React.FC<{
  img: string;
  answer: string;
  duration: number;
  index: number;
  blurIntro?: boolean;
}> = ({ img, answer, duration, index, blurIntro }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = index === 0 ? 1 : spring({ frame, fps, config: { damping: 16, mass: 0.7 } });
  const exit = interpolate(frame, [duration - 8, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const x = (1 - enter) * 1100 - exit * 1100;

  const blur = blurIntro
    ? interpolate(frame, [6, 72], [34, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const zoom = interpolate(frame, [0, duration], [1.08, 1]);

  const typeStart = blurIntro ? 74 : 12;
  const typed = Math.max(0, Math.floor((frame - typeStart) * 1.1));
  const shown = answer.slice(0, typed);
  const validatedAt = typeStart + answer.length / 1.1 + 4;
  const ok = spring({ frame: frame - validatedAt, fps, config: { damping: 11 } });
  const validated = frame >= validatedAt;

  // Le chrono tourne vite pour la dramaturgie
  const seconds = Math.max(3, 45 - frame * (blurIntro ? 0.22 : 0.35) - index * 4);

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute", top: 560, left: 60 + x, width: 960, height: 540,
          borderRadius: 36, overflow: "hidden",
          boxShadow: validated
            ? `0 0 0 6px ${C.green}, 0 30px 90px rgba(34,197,94,${0.35 * ok})`
            : `0 0 0 4px rgba(168,85,247,0.7), 0 30px 90px rgba(168,85,247,0.35)`,
        }}
      >
        <Img
          src={staticFile(img)}
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            filter: `blur(${blur}px)`, transform: `scale(${zoom})`,
          }}
        />
        {blurIntro && blur > 1 ? (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 220, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>?</div>
          </AbsoluteFill>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute", top: 1170, left: 60 + x, width: 960, height: 130, borderRadius: 28,
          background: "rgba(20,16,34,0.85)",
          border: `4px solid ${validated ? C.green : "rgba(255,255,255,0.18)"}`,
          display: "flex", alignItems: "center", padding: "0 40px", boxSizing: "border-box",
          fontSize: 58, fontWeight: 800, color: C.text, gap: 24,
        }}
      >
        <span style={{ flex: 1, color: shown ? C.text : C.muted }}>
          {shown || "Ta réponse…"}
          {!validated && shown && frame % 16 < 8 ? <span style={{ color: C.purple }}>|</span> : null}
        </span>
        {validated ? (
          <span
            style={{
              transform: `scale(${ok})`, width: 86, height: 86, borderRadius: "50%", background: C.green,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, color: "#06210f",
            }}
          >
            ✓
          </span>
        ) : null}
      </div>

      <div style={{ position: "absolute", top: 1360, transform: `translateX(${x}px)` }}>
        <TimerRing seconds={seconds} />
      </div>
    </AbsoluteFill>
  );
};

const RoundsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({ frame, fps, config: { damping: 14 } });

  let start = 0;
  const current = ROUNDS.findIndex((r) => {
    const inside = frame < start + r.duration;
    if (!inside) start += r.duration;
    return inside;
  });

  let from = 0;
  return (
    <SceneFade duration={ROUNDS_DURATION}>
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div
          style={{
            position: "absolute", top: 150, textAlign: "center", width: 960,
            fontSize: 104, lineHeight: 1.05, fontWeight: 900, color: C.text, letterSpacing: -2,
            transform: `translateY(${(1 - titleIn) * -80}px)`, opacity: titleIn,
          }}
        >
          Tu reconnais
          <br />
          <GradientText>ce jeu ?</GradientText>
        </div>
        <div
          style={{
            position: "absolute", top: 450, padding: "14px 34px", borderRadius: 999,
            background: "rgba(168,85,247,0.18)", border: `2px solid ${C.purple}`,
            fontSize: 38, fontWeight: 700, color: C.text, opacity: titleIn,
          }}
        >
          Capture {Math.max(1, current + 1)} / 10
        </div>
      </AbsoluteFill>
      {ROUNDS.map((r, i) => {
        const seq = (
          <Sequence key={r.img} from={from} durationInFrames={r.duration} layout="none">
            <Round {...r} index={i} />
          </Sequence>
        );
        from += r.duration;
        return seq;
      })}
    </SceneFade>
  );
};

/* ---------- Scène 3 : la boîte du jour ---------- */

const BoxScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const title = spring({ frame, fps, config: { damping: 14 } });
  const lid = spring({ frame: frame - 4, fps, config: { damping: 9, mass: 0.8 } });

  const stats = [
    { big: "10", small: "captures par jour", color: C.purple },
    { big: "45 s", small: "par capture", color: C.cyan },
    { big: "↗", small: "de plus en plus dur", color: C.pink },
  ];

  return (
    <SceneFade duration={BOX_DURATION}>
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ position: "absolute", top: 170, transform: `scale(${0.6 + 0.4 * title})` }}>
          <BoxLogo size={220} open={lid} />
        </div>
        <div
          style={{
            position: "absolute", top: 430, width: 980, textAlign: "center", fontSize: 86, fontWeight: 900,
            color: C.text, lineHeight: 1.08, letterSpacing: -1.5, opacity: title,
          }}
        >
          Chaque jour,
          <br />
          <GradientText>une nouvelle boîte</GradientText>
        </div>

        <div
          style={{
            position: "absolute", top: 720, width: 1000, display: "flex", flexWrap: "wrap",
            gap: 20, justifyContent: "center",
          }}
        >
          {THUMBS.map((t, i) => {
            const s = spring({ frame: frame - 10 - i * 3, fps, config: { damping: 12 } });
            return (
              <div
                key={t}
                style={{
                  width: 180, height: 240, borderRadius: 22, overflow: "hidden", position: "relative",
                  transform: `scale(${s}) rotate(${(1 - s) * (i % 2 ? 12 : -12)}deg)`,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.5)", border: "3px solid rgba(255,255,255,0.12)",
                }}
              >
                <Img src={staticFile(`daily-promo/shots/${t}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div
                  style={{
                    position: "absolute", left: 10, top: 10, width: 48, height: 48, borderRadius: "50%",
                    background: GRADIENT, color: "white", fontSize: 26, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {i + 1}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ position: "absolute", top: 1330, display: "flex", gap: 24 }}>
          {stats.map((s, i) => {
            const p = spring({ frame: frame - 45 - i * 8, fps, config: { damping: 13 } });
            return (
              <div
                key={s.small}
                style={{
                  width: 300, padding: "30px 10px", borderRadius: 28, textAlign: "center",
                  background: "rgba(20,16,34,0.8)", border: `3px solid ${s.color}`,
                  transform: `translateY(${(1 - p) * 120}px)`, opacity: p,
                }}
              >
                <div style={{ fontSize: 76, fontWeight: 900, color: s.color }}>{s.big}</div>
                <div style={{ fontSize: 32, fontWeight: 600, color: C.text }}>{s.small}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};

/* ---------- Scène 4 : l'appli ---------- */

const FEATURES = [
  { label: "Classement en direct", color: C.warning, side: "left", top: 560 },
  { label: "Panorama : retrouve la scène sur la carte", color: C.cyan, side: "right", top: 900 },
  { label: "Indices si tu sèches", color: C.blue, side: "left", top: 1240 },
  { label: "Rattrape la boîte d'hier", color: C.pink, side: "right", top: 1540 },
] as const;

const AppScene: React.FC<{ screens: string[] }> = ({ screens }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phoneIn = spring({ frame, fps, config: { damping: 15 } });
  const title = spring({ frame: frame - 4, fps, config: { damping: 14 } });

  const per = APP_DURATION / screens.length;

  return (
    <SceneFade duration={APP_DURATION}>
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div
          style={{
            position: "absolute", top: 150, width: 980, textAlign: "center", fontSize: 84, fontWeight: 900,
            color: C.text, letterSpacing: -1.5, lineHeight: 1.08, opacity: title,
          }}
        >
          Et tu te mesures
          <br />
          <GradientText>à tout le monde</GradientText>
        </div>

        <div
          style={{
            position: "absolute", top: 420, width: 560, height: 1214, borderRadius: 64,
            border: "14px solid #1c1a26", overflow: "hidden", background: "#000",
            boxShadow: "0 40px 120px rgba(168,85,247,0.45)",
            transform: `translateY(${(1 - phoneIn) * 1400}px)`,
          }}
        >
          {screens.map((s, i) => {
            const o = interpolate(frame, [i * per - 6, i * per + 6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const scroll = interpolate(frame, [i * per, (i + 1) * per], [0, -60], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <Img
                key={s}
                src={staticFile(s)}
                style={{
                  position: "absolute", top: scroll, width: "100%", opacity: i === 0 ? 1 : o,
                }}
              />
            );
          })}
        </div>

        {FEATURES.map((f, i) => {
          const p = spring({ frame: frame - 30 - i * 18, fps, config: { damping: 12 } });
          const dir = f.side === "left" ? -1 : 1;
          return (
            <div
              key={f.label}
              style={{
                position: "absolute", top: f.top, [f.side]: 40, maxWidth: 560,
                padding: "26px 34px", borderRadius: 30, background: "rgba(15,12,26,0.92)",
                border: `3px solid ${f.color}`, boxShadow: `0 20px 60px ${f.color}55`,
                fontSize: 44, fontWeight: 800, color: C.text, lineHeight: 1.15,
                transform: `translateX(${(1 - p) * 700 * dir}px) rotate(${dir * -2}deg)`,
                display: "flex", alignItems: "center", gap: 20,
              }}
            >
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
              {f.label}
            </div>
          );
        })}
      </AbsoluteFill>
    </SceneFade>
  );
};

/* ---------- Scène 5 : appel à l'action ---------- */

const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 12 } });
  const lid = spring({ frame: frame - 12, fps, config: { damping: 7, mass: 0.9 } });
  const text = spring({ frame: frame - 20, fps, config: { damping: 14 } });
  const btn = spring({ frame: frame - 34, fps, config: { damping: 10 } });
  const pulse = 1 + Math.sin(frame / 6) * 0.025 * btn;
  const url = spring({ frame: frame - 46, fps, config: { damping: 14 } });

  return (
    <SceneFade duration={CTA_DURATION}>
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div
          style={{
            position: "absolute", top: 260, transform: `scale(${logo}) rotate(${(1 - logo) * -20}deg)`,
            filter: `drop-shadow(0 0 ${40 * lid}px ${C.purple})`,
          }}
        >
          <BoxLogo size={340} open={lid} />
        </div>
        <div
          style={{
            position: "absolute", top: 640, fontSize: 150, fontWeight: 900, letterSpacing: -4,
            color: C.text, opacity: text, transform: `translateY(${(1 - text) * 60}px)`,
          }}
        >
          The <GradientText>Box</GradientText>
        </div>
        <div
          style={{
            position: "absolute", top: 840, fontSize: 52, fontWeight: 600, color: C.muted,
            opacity: text, textAlign: "center", width: 900,
          }}
        >
          Une capture. Un jeu à deviner.
        </div>

        <div
          style={{
            position: "absolute", top: 1030, padding: "40px 80px", borderRadius: 40, background: GRADIENT,
            fontSize: 62, fontWeight: 900, color: "white",
            transform: `scale(${btn * pulse})`, boxShadow: "0 30px 90px rgba(236,72,153,0.5)",
          }}
        >
          Ouvre la boîte du jour
        </div>

        <div
          style={{
            position: "absolute", top: 1290, fontSize: 60, fontWeight: 800, color: C.text,
            opacity: url, transform: `translateY(${(1 - url) * 40}px)`,
          }}
        >
          the-box.battistella.ovh
        </div>
        <div
          style={{
            position: "absolute", top: 1400, fontSize: 40, fontWeight: 600, color: C.cyan, opacity: url,
          }}
        >
          Gratuit · Sans compte · Dans ton navigateur
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};

/* ---------- Montage ---------- */

export const DailyBoxPromo: React.FC = () => {
  const screens = ["daily-promo/app-home.png", "daily-promo/app-leaderboard.png", "daily-promo/app-panorama.png"];
  let t = 0;
  const at = (d: number) => {
    const from = t;
    t += d;
    return from;
  };
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Background />
      <Sequence from={at(ROUNDS_DURATION)} durationInFrames={ROUNDS_DURATION}>
        <RoundsScene />
      </Sequence>
      <Sequence from={at(BOX_DURATION)} durationInFrames={BOX_DURATION}>
        <BoxScene />
      </Sequence>
      <Sequence from={at(APP_DURATION)} durationInFrames={APP_DURATION}>
        <AppScene screens={screens} />
      </Sequence>
      <Sequence from={at(CTA_DURATION)} durationInFrames={CTA_DURATION}>
        <CtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
