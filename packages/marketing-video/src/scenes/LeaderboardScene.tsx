import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { GridBackground } from "../components/GridBackground";
import { Reveal } from "../components/Reveal";
import { fontStack, monoStack, theme } from "../theme";

type Row = { rank: number; name: string; score: number; medal?: string };

const rows: Row[] = [
  { rank: 1, name: "PixelHunter", score: 9840, medal: "GOLD" },
  { rank: 2, name: "RetroSpec", score: 9610, medal: "SILVER" },
  { rank: 3, name: "FrameByFrame", score: 9420, medal: "BRONZE" },
  { rank: 4, name: "GhostInTheMachine", score: 9210 },
  { rank: 5, name: "OneShotOneKill", score: 8990 },
];

const medalColor = (medal?: string) => {
  if (medal === "GOLD") return "linear-gradient(135deg, #fde047, #f59e0b)";
  if (medal === "SILVER") return "linear-gradient(135deg, #e5e7eb, #9ca3af)";
  if (medal === "BRONZE") return "linear-gradient(135deg, #fdba74, #b45309)";
  return "rgba(168, 85, 247, 0.2)";
};

const LeaderboardRow: React.FC<{ row: Row; delay: number; animateScore: boolean }> = ({
  row,
  delay,
  animateScore,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame - delay) / fps;

  // Animate the score upward to feel "live"
  const displayedScore = animateScore
    ? Math.round(
        interpolate(t, [0, 1.6], [0, row.score], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      )
    : row.score;

  return (
    <Reveal delay={delay} travel={20}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px 1fr auto",
          alignItems: "center",
          gap: 20,
          padding: "18px 28px",
          borderRadius: 14,
          background:
            "linear-gradient(90deg, rgba(168, 85, 247, 0.10) 0%, rgba(19, 19, 26, 0.4) 100%)",
          border: "1px solid rgba(168, 85, 247, 0.25)",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: medalColor(row.medal),
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontFamily: monoStack,
            fontSize: 24,
            fontWeight: 800,
            color: row.medal ? "#0a0a0f" : "#e9d5ff",
          }}
        >
          #{row.rank}
        </div>
        <div
          style={{
            fontFamily: fontStack,
            fontSize: 28,
            fontWeight: 600,
            color: theme.textPrimary,
            letterSpacing: "-0.01em",
          }}
        >
          {row.name}
        </div>
        <div
          style={{
            fontFamily: monoStack,
            fontSize: 28,
            fontWeight: 700,
            color: theme.neonPink,
            textShadow: "0 0 12px rgba(244, 114, 182, 0.5)",
            minWidth: 140,
            textAlign: "right",
          }}
        >
          {displayedScore.toLocaleString()}
        </div>
      </div>
    </Reveal>
  );
};

export const LeaderboardScene: React.FC = () => {
  return (
    <AbsoluteFill>
      <GridBackground intensity={0.55} />
      <AbsoluteFill
        style={{
          padding: "110px 200px",
          flexDirection: "column",
          gap: 36,
          justifyContent: "center",
        }}
      >
        <Reveal delay={2}>
          <div
            style={{
              fontFamily: fontStack,
              fontSize: 24,
              color: theme.neonCyan,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Live Leaderboard
          </div>
        </Reveal>
        <Reveal delay={8} travel={30}>
          <div
            style={{
              fontFamily: fontStack,
              fontSize: 84,
              fontWeight: 800,
              color: theme.textPrimary,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            Race to the top in{" "}
            <span
              style={{
                backgroundImage: theme.gradientPurplePink,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              real time
            </span>
            .
          </div>
        </Reveal>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
          {rows.map((row, i) => (
            <LeaderboardRow
              key={row.rank}
              row={row}
              delay={22 + i * 6}
              animateScore={i < 3}
            />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
