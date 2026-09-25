import React from "react";
import { Composition } from "remotion";
import { MarketingVideo } from "./MarketingVideo";
import { ShortVideo } from "./ShortVideo";
import { FounderClip } from "./FounderClip";
import { DailyBoxPromo, PROMO_DURATION } from "./DailyBoxPromo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 30s landscape (1920×1080 @ 30fps = 900 frames) */}
      <Composition
        id="the-box-marketing"
        component={MarketingVideo}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ withAudio: false }}
      />

      {/* ~12s vertical short (1080×1920 @ 30fps = 360 frames) */}
      <Composition
        id="the-box-short"
        component={ShortVideo}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* ~19.7s founder clip (1920×1080 @ 30fps).
          60 + 450 + 120 sequence frames − two 20-frame transitions = 590. */}
      <Composition
        id="the-box-founder"
        component={FounderClip}
        durationInFrames={590}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          founderName: "",
          withFounderVideo: false,
          withAudio: false,
        }}
      />

      {/* ~25s vertical promo for Facebook/Instagram Reels (1080×1920 @ 30fps).
          Assets live in public/daily-promo/ — see scripts/fetch-daily-promo-assets.mjs. */}
      <Composition
        id="the-box-daily-promo"
        component={DailyBoxPromo}
        durationInFrames={PROMO_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
