import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { Cube } from "../components/Cube";
import { GradientText } from "../components/GradientText";
import { GridBackground } from "../components/GridBackground";
import { Reveal } from "../components/Reveal";
import { fontStack, theme } from "../theme";

export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const buttonScale = spring({
    frame: frame - 30,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  // Subtle button pulse after it lands
  const pulse = interpolate(
    Math.sin((frame - 60) / 12),
    [-1, 1],
    [1, 1.04],
  );
  const buttonTransform = `scale(${
    frame < 30 ? 0 : frame < 60 ? buttonScale : pulse
  })`;

  return (
    <AbsoluteFill>
      <GridBackground intensity={1.2} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 48,
        }}
      >
        <Reveal delay={2} travel={50}>
          <Cube size={180} />
        </Reveal>

        <Reveal delay={14}>
          <GradientText size={120} weight={900}>
            Play the box.
          </GradientText>
        </Reveal>

        <Reveal delay={22}>
          <div
            style={{
              fontFamily: fontStack,
              fontSize: 30,
              fontWeight: 500,
              color: theme.textMuted,
              letterSpacing: "0.04em",
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            Ten new screenshots every day. Free to play. No install required.
          </div>
        </Reveal>

        <div style={{ transform: buttonTransform, marginTop: 20 }}>
          <div
            style={{
              padding: "26px 60px",
              borderRadius: 999,
              background: theme.gradientPurplePink,
              fontFamily: fontStack,
              fontSize: 36,
              fontWeight: 800,
              color: "#0a0a0f",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              boxShadow:
                "0 0 40px rgba(168, 85, 247, 0.7), 0 0 80px rgba(244, 114, 182, 0.4)",
            }}
          >
            Start Today's Guess
          </div>
        </div>

        <Reveal delay={50}>
          <div
            style={{
              fontFamily: fontStack,
              fontSize: 22,
              color: theme.textMuted,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginTop: 16,
            }}
          >
            the-box.battistella.ovh
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
