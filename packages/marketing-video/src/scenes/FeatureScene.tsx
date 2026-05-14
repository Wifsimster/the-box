import React from "react";
import { AbsoluteFill } from "remotion";
import { GridBackground } from "../components/GridBackground";
import { Reveal } from "../components/Reveal";
import { fontStack, theme } from "../theme";

type Feature = {
  emoji?: string;
  icon: React.ReactNode;
  title: string;
  description: string;
};

type Props = {
  eyebrow: string;
  headline: string;
  features: Feature[];
};

/**
 * Reusable feature highlight slide. Used by Daily Challenges, Hints,
 * Achievements, Leaderboards.
 */
export const FeatureScene: React.FC<Props> = ({ eyebrow, headline, features }) => {
  return (
    <AbsoluteFill>
      <GridBackground intensity={0.55} />
      <AbsoluteFill
        style={{
          padding: "110px 140px",
          flexDirection: "column",
          justifyContent: "center",
          gap: 60,
        }}
      >
        <Reveal delay={2}>
          <div
            style={{
              fontFamily: fontStack,
              fontSize: 24,
              color: theme.neonPink,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </div>
        </Reveal>

        <Reveal delay={8} travel={30}>
          <div
            style={{
              fontFamily: fontStack,
              fontSize: 92,
              fontWeight: 800,
              color: theme.textPrimary,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              maxWidth: 1400,
            }}
          >
            {headline}
          </div>
        </Reveal>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${features.length}, 1fr)`,
            gap: 32,
            marginTop: 20,
          }}
        >
          {features.map((feature, i) => (
            <Reveal key={feature.title} delay={20 + i * 8} travel={36}>
              <div
                style={{
                  background:
                    "linear-gradient(180deg, rgba(168, 85, 247, 0.10) 0%, rgba(19, 19, 26, 0.6) 100%)",
                  border: "1.5px solid rgba(168, 85, 247, 0.35)",
                  borderRadius: 18,
                  padding: 30,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  boxShadow: "0 10px 40px rgba(168, 85, 247, 0.15)",
                  minHeight: 220,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: theme.gradientPurplePink,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 32,
                    boxShadow: "0 0 20px rgba(244, 114, 182, 0.6)",
                  }}
                >
                  {feature.icon}
                </div>
                <div
                  style={{
                    fontFamily: fontStack,
                    fontSize: 28,
                    fontWeight: 700,
                    color: theme.textPrimary,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {feature.title}
                </div>
                <div
                  style={{
                    fontFamily: fontStack,
                    fontSize: 20,
                    color: theme.textMuted,
                    lineHeight: 1.4,
                  }}
                >
                  {feature.description}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
