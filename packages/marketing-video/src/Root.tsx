import React from "react";
import { Composition } from "remotion";
import { MarketingVideo } from "./MarketingVideo";
import { ShortVideo } from "./ShortVideo";
import { FounderClip } from "./FounderClip";
import { DailyBoxPromo, PROMO_DURATION } from "./DailyBoxPromo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="the-box-marketing"
        component={MarketingVideo}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ withAudio: false }}
      />

      <Composition
        id="the-box-short"
        component={ShortVideo}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1920}
      />

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
