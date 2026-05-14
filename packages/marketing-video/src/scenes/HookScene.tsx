import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { GridBackground } from "../components/GridBackground";
import { Reveal } from "../components/Reveal";
import { fontStack, theme } from "../theme";

/**
 * Mocked screenshot tile that pulses like a thumbnail in the carousel.
 * No real screenshot bundled — we render a stylised placeholder so the
 * video stays self-contained.
 */
const ScreenshotTile: React.FC<{ delay: number; hue: number; label: string }> = ({
  delay,
  hue,
  label,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const float = Math.sin((frame - delay) / fps + hue) * 6;

  return (
    <Reveal delay={delay} travel={50}>
      <div
        style={{
          width: 360,
          height: 220,
          borderRadius: 14,
          background: `linear-gradient(135deg, hsl(${hue}, 80%, 22%) 0%, hsl(${
            hue + 30
          }, 70%, 12%) 100%)`,
          border: "1.5px solid rgba(244, 114, 182, 0.35)",
          boxShadow:
            "0 20px 60px rgba(168, 85, 247, 0.25), inset 0 0 40px rgba(168, 85, 247, 0.15)",
          transform: `translateY(${float}px)`,
          position: "relative",
          overflow: "hidden",
          fontFamily: fontStack,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.7) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 14,
            color: theme.textPrimary,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: 0.85,
          }}
        >
          {label}
        </div>
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(244, 114, 182, 0.18)",
            border: "1px solid rgba(244, 114, 182, 0.6)",
            color: "#fce7f3",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Daily
        </div>
      </div>
    </Reveal>
  );
};

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  // Headline pop on first beat
  const headlineScale = interpolate(frame, [0, 14], [0.92, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <GridBackground intensity={0.7} />
      <AbsoluteFill
        style={{
          padding: "120px 100px",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 80,
        }}
      >
        <Reveal delay={2}>
          <div
            style={{
              fontFamily: fontStack,
              fontSize: 84,
              fontWeight: 800,
              color: theme.textPrimary,
              letterSpacing: "-0.02em",
              textAlign: "center",
              lineHeight: 1.05,
              transform: `scale(${headlineScale})`,
            }}
          >
            One screenshot.
            <br />
            <span
              style={{
                backgroundImage: theme.gradientPurplePink,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Three guesses.
            </span>
          </div>
        </Reveal>

        <div style={{ display: "flex", gap: 32 }}>
          <ScreenshotTile delay={20} hue={270} label="Mystery #1" />
          <ScreenshotTile delay={28} hue={310} label="Mystery #2" />
          <ScreenshotTile delay={36} hue={200} label="Mystery #3" />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
