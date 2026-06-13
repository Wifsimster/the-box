import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import {
  linearTiming,
  springTiming,
  TransitionSeries,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Cube } from "./components/Cube";
import { GradientText } from "./components/GradientText";
import { GridBackground } from "./components/GridBackground";
import { Reveal } from "./components/Reveal";
import { fontStack, monoStack, theme } from "./theme";

/**
 * "A quick word from the founder" clip (principle #15 — people buy from
 * people). Renders standalone today as a captioned founder message over the
 * gaming theme; when a real talking-head recording exists, drop it at
 * `public/founder.mp4` and render with `--props='{"withFounderVideo":true}'`
 * — the captions then double as burned-in subtitles.
 *
 * Optional soundtrack: `public/founder-vo.mp3` (voice-over) mixes in when
 * `withAudio` is set.
 */

export type FounderClipProps = {
  /** Display name on the nameplate. Empty → generic "The Box · Founder". */
  founderName?: string;
  /** Use a real recording from public/founder.mp4 instead of the cam placeholder. */
  withFounderVideo?: boolean;
  /** Mix public/founder-vo.mp3 if present. */
  withAudio?: boolean;
};

// ---- Script -------------------------------------------------------------
// Frames are relative to the message scene start (30fps). Lines are shown
// one at a time; keep them short enough to read at a glance.
type Line = { text: string; from: number; to: number };

const SCRIPT: readonly Line[] = [
  { text: "Hey — I'm the dev behind The Box.", from: 0, to: 96 },
  {
    text: "I wanted one quick game-guessing challenge a day. No grind, no install.",
    from: 96,
    to: 216,
  },
  {
    text: "One screenshot. One guess. The same puzzle for everyone, every day.",
    from: 216,
    to: 336,
  },
  {
    text: "Come prove your gaming cred — it's free, and today's challenge is live.",
    from: 336,
    to: 450,
  },
];

const MESSAGE_DURATION = 450;

// ---- Founder cam --------------------------------------------------------

const RecDot: React.FC = () => {
  const frame = useCurrentFrame();
  // Blink roughly once per second.
  const on = Math.sin(frame / 9) > -0.2;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily: monoStack,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: "0.18em",
        color: theme.textPrimary,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#ef4444",
          opacity: on ? 1 : 0.25,
          boxShadow: on ? "0 0 16px rgba(239,68,68,0.9)" : "none",
        }}
      />
      REC
    </div>
  );
};

const FounderCam: React.FC<FounderClipProps> = ({
  founderName,
  withFounderVideo,
}) => {
  const frame = useCurrentFrame();
  // Gentle breathing scale on the placeholder ring so the tile feels alive.
  const pulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.98, 1.04]);
  const name = founderName && founderName.trim().length > 0 ? founderName : "The Box";

  return (
    <div
      style={{
        position: "relative",
        width: 640,
        height: 640,
        borderRadius: 28,
        overflow: "hidden",
        background: theme.bgPanel,
        border: "2px solid rgba(168, 85, 247, 0.45)",
        boxShadow:
          "0 0 60px rgba(168, 85, 247, 0.35), inset 0 0 80px rgba(10,10,15,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {withFounderVideo ? (
        <OffthreadVideo
          src={staticFile("founder.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        // Intentional "founder cam" placeholder — reads as a webcam tile, not
        // a missing asset. Swap in real footage via withFounderVideo.
        <>
          <div
            style={{
              position: "absolute",
              width: 320,
              height: 320,
              borderRadius: 999,
              background:
                "radial-gradient(circle at 50% 40%, rgba(168,85,247,0.35), rgba(10,10,15,0) 70%)",
              transform: `scale(${pulse})`,
            }}
          />
          <div
            style={{
              width: 260,
              height: 260,
              borderRadius: 999,
              background: theme.gradientPurplePink,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 130,
              boxShadow: "0 0 50px rgba(244,114,182,0.5)",
            }}
          >
            👋
          </div>
        </>
      )}

      {/* REC indicator — top-left */}
      <div style={{ position: "absolute", top: 24, left: 24 }}>
        <RecDot />
      </div>

      {/* Nameplate — bottom strip */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "20px 28px",
          background:
            "linear-gradient(0deg, rgba(10,10,15,0.92) 0%, rgba(10,10,15,0) 100%)",
          fontFamily: fontStack,
        }}
      >
        <div
          style={{ fontSize: 30, fontWeight: 800, color: theme.textPrimary }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: theme.textMuted,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Founder
        </div>
      </div>
    </div>
  );
};

// ---- Caption ------------------------------------------------------------

const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const active = SCRIPT.find((l) => frame >= l.from && frame < l.to);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 28,
      }}
    >
      <div
        style={{
          fontFamily: fontStack,
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: theme.neonPink,
        }}
      >
        A quick word from the founder
      </div>

      {/* Caption swaps per line; key forces a fresh fade on each change. */}
      {active ? (
        <CaptionLine key={active.from} text={active.text} from={active.from} />
      ) : null}

      {/* Progress ticks — one per line, fills as the message plays. */}
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        {SCRIPT.map((l) => {
          const done = frame >= l.to;
          const current = frame >= l.from && frame < l.to;
          return (
            <div
              key={l.from}
              style={{
                width: 64,
                height: 6,
                borderRadius: 999,
                background: done
                  ? theme.neonPurple
                  : current
                    ? "rgba(168,85,247,0.55)"
                    : "rgba(255,255,255,0.14)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const CaptionLine: React.FC<{ text: string; from: number }> = ({
  text,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - from,
    fps,
    config: { damping: 18, stiffness: 120, mass: 1 },
  });
  const opacity = interpolate(progress, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(progress, [0, 1], [24, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        fontFamily: fontStack,
        fontSize: 58,
        fontWeight: 800,
        lineHeight: 1.15,
        color: theme.textPrimary,
        maxWidth: 980,
      }}
    >
      {text}
    </div>
  );
};

// ---- Scenes -------------------------------------------------------------

const IntroCard: React.FC = () => (
  <AbsoluteFill>
    <GridBackground />
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 36,
      }}
    >
      <Reveal delay={2} travel={50}>
        <Cube size={200} />
      </Reveal>
      <Reveal delay={14}>
        <GradientText size={92} weight={900}>
          Made by a player.
        </GradientText>
      </Reveal>
      <Reveal delay={24}>
        <div
          style={{
            fontFamily: fontStack,
            fontSize: 30,
            fontWeight: 500,
            color: theme.textMuted,
            letterSpacing: "0.06em",
          }}
        >
          The story behind The Box, in 20 seconds.
        </div>
      </Reveal>
    </AbsoluteFill>
  </AbsoluteFill>
);

const MessageScene: React.FC<FounderClipProps> = (props) => (
  <AbsoluteFill>
    <GridBackground intensity={0.7} />
    <AbsoluteFill
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 72,
        padding: "0 110px",
      }}
    >
      <FounderCam {...props} />
      <Captions />
    </AbsoluteFill>
  </AbsoluteFill>
);

const OutroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame / 12), [-1, 1], [1, 1.04]);
  return (
    <AbsoluteFill>
      <GridBackground intensity={1.2} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 40,
        }}
      >
        <Reveal delay={4}>
          <GradientText size={104} weight={900}>
            Your turn.
          </GradientText>
        </Reveal>
        <div style={{ transform: `scale(${frame < 18 ? 0 : pulse})` }}>
          <div
            style={{
              padding: "24px 56px",
              borderRadius: 999,
              background: theme.gradientPurplePink,
              fontFamily: fontStack,
              fontSize: 34,
              fontWeight: 800,
              color: "#0a0a0f",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              boxShadow:
                "0 0 40px rgba(168, 85, 247, 0.7), 0 0 80px rgba(244, 114, 182, 0.4)",
            }}
          >
            Play today's challenge
          </div>
        </div>
        <Reveal delay={40}>
          <div
            style={{
              fontFamily: fontStack,
              fontSize: 22,
              color: theme.textMuted,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            the-box.battistella.ovh
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const tryVoiceOver = (): string | null => {
  try {
    return staticFile("founder-vo.mp3");
  } catch {
    return null;
  }
};

export const FounderClip: React.FC<FounderClipProps> = (props) => {
  const audioSrc = props.withAudio ? tryVoiceOver() : null;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {audioSrc ? <Audio src={audioSrc} volume={0.7} /> : null}

      <TransitionSeries>
        {/* Intro nameplate */}
        <TransitionSeries.Sequence durationInFrames={60}>
          <IntroCard />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
          presentation={fade()}
        />

        {/* Founder message */}
        <TransitionSeries.Sequence durationInFrames={MESSAGE_DURATION}>
          <MessageScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 20 })}
          presentation={slide({ direction: "from-right" })}
        />

        {/* CTA */}
        <TransitionSeries.Sequence durationInFrames={120}>
          <OutroCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
