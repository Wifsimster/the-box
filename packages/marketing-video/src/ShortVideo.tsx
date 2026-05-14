import React from "react";
import { AbsoluteFill } from "remotion";
import {
  linearTiming,
  springTiming,
  TransitionSeries,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { IntroScene } from "./scenes/IntroScene";
import { HookScene } from "./scenes/HookScene";
import { CTAScene } from "./scenes/CTAScene";

/**
 * Vertical 9:16 cut for social shorts. Reuses the intro, hook, and CTA
 * scenes — they were laid out centred so they re-flow gracefully into the
 * portrait viewport.
 */
export const ShortVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0f" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={75}>
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 16 })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <HookScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 18 })}
          presentation={slide({ direction: "from-bottom" })}
        />
        <TransitionSeries.Sequence durationInFrames={150}>
          <CTAScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
