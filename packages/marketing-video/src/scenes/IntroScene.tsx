import React from "react";
import { AbsoluteFill } from "remotion";
import { Cube } from "../components/Cube";
import { GradientText } from "../components/GradientText";
import { GridBackground } from "../components/GridBackground";
import { Reveal } from "../components/Reveal";
import { fontStack, theme } from "../theme";

export const IntroScene: React.FC = () => {
  return (
    <AbsoluteFill>
      <GridBackground />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 40,
          flexDirection: "column",
        }}
      >
        <Reveal delay={4} travel={60}>
          <Cube size={280} />
        </Reveal>

        <Reveal delay={18}>
          <GradientText size={140} weight={900} letterSpacing="-0.03em">
            THE BOX
          </GradientText>
        </Reveal>

        <Reveal delay={32}>
          <div
            style={{
              fontFamily: fontStack,
              fontSize: 34,
              fontWeight: 500,
              color: theme.textMuted,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Guess the game from a screenshot
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
