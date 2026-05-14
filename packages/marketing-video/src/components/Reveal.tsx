import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";

type Props = {
  children: React.ReactNode;
  delay?: number;
  /** How far below the rest position the element starts (px) */
  travel?: number;
  damping?: number;
};

/**
 * Spring-based slide + fade reveal. Wraps any element to make it enter
 * smoothly when a sequence becomes active.
 */
export const Reveal: React.FC<Props> = ({
  children,
  delay = 0,
  travel = 40,
  damping = 18,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping, stiffness: 120, mass: 1 },
  });

  const opacity = interpolate(progress, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(progress, [0, 1], [travel, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        display: "inline-block",
      }}
    >
      {children}
    </div>
  );
};
