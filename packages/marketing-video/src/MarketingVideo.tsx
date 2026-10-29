import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import {
  linearTiming,
  springTiming,
  TransitionSeries,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { IntroScene } from "./scenes/IntroScene";
import { HookScene } from "./scenes/HookScene";
import { FeatureScene } from "./scenes/FeatureScene";
import { LeaderboardScene } from "./scenes/LeaderboardScene";
import { CTAScene } from "./scenes/CTAScene";

const tryAudio = (): string | null => {
  try {
    return staticFile("soundtrack.mp3");
  } catch {
    return null;
  }
};

export const MarketingVideo: React.FC<{ withAudio?: boolean }> = ({
  withAudio = false,
}) => {
  const audioSrc = withAudio ? tryAudio() : null;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0f" }}>
      {audioSrc ? <Audio src={audioSrc} volume={0.6} /> : null}

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
          presentation={fade()}
        />

        <TransitionSeries.Sequence durationInFrames={150}>
          <HookScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 20 })}
          presentation={slide({ direction: "from-right" })}
        />

        <TransitionSeries.Sequence durationInFrames={150}>
          <FeatureScene
            eyebrow="Daily Drop"
            headline="Ten fresh screenshots, every day."
            features={[
              {
                icon: "📅",
                title: "Tiered difficulty",
                description:
                  "Three tiers stack up. Survive Easy → Medium → Hard in one run.",
              },
              {
                icon: "⚡",
                title: "Speed pays",
                description:
                  "Answer under 3s for 2× points. The multiplier fades to 1× past 20s.",
              },
              {
                icon: "⏪",
                title: "Catch-up mode",
                description:
                  "Missed a day? Replay any of the last 7 challenges.",
              },
            ]}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 20 })}
          presentation={slide({ direction: "from-right" })}
        />

        <TransitionSeries.Sequence durationInFrames={150}>
          <FeatureScene
            eyebrow="Power up"
            headline="Stuck? Spend a hint."
            features={[
              {
                icon: "💡",
                title: "Reveal a clue",
                description:
                  "Year, publisher, developer, or genre — burn an inventory hint or pay 20%.",
              },
              {
                icon: "⏱️",
                title: "x2 Timer",
                description:
                  "Earn one every 6 correct guesses. Doubles the seconds left when the clock bites.",
              },
              {
                icon: "🏆",
                title: "Achievements",
                description:
                  "From First Win to Weekly Warrior — earn, display, brag.",
              },
            ]}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 20 })}
          presentation={slide({ direction: "from-right" })}
        />

        <TransitionSeries.Sequence durationInFrames={150}>
          <LeaderboardScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 24 })}
          presentation={fade()}
        />

        <TransitionSeries.Sequence durationInFrames={210}>
          <CTAScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
