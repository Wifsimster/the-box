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

/**
 * Optional audio asset. Drop a royalty-free track at
 * `public/soundtrack.mp3` and it will mix in automatically; otherwise the
 * video renders silent.
 */
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
        {/* 0:00–0:03 — Logo intro */}
        <TransitionSeries.Sequence durationInFrames={90}>
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
          presentation={fade()}
        />

        {/* 0:03–0:08 — The hook */}
        <TransitionSeries.Sequence durationInFrames={150}>
          <HookScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 20 })}
          presentation={slide({ direction: "from-right" })}
        />

        {/* 0:08–0:13 — Daily Challenges */}
        <TransitionSeries.Sequence durationInFrames={150}>
          <FeatureScene
            eyebrow="Daily Drop"
            headline="A fresh screenshot, every day."
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

        {/* 0:13–0:18 — Power-ups & Achievements */}
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
                  "From first-blood to streak-of-30 — earn, display, brag.",
              },
            ]}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 20 })}
          presentation={slide({ direction: "from-right" })}
        />

        {/* 0:18–0:23 — Live leaderboards */}
        <TransitionSeries.Sequence durationInFrames={150}>
          <LeaderboardScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 24 })}
          presentation={fade()}
        />

        {/* 0:23–0:30 — CTA */}
        <TransitionSeries.Sequence durationInFrames={210}>
          <CTAScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
