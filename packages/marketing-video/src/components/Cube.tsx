import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

type Props = {
  size?: number;
  spin?: boolean;
  glow?: boolean;
};

/**
 * Wireframe 3D cube — mirrors public/logo.svg from the frontend, but spins
 * and pulses on the perspective Y axis using a CSS 3D transform.
 */
export const Cube: React.FC<Props> = ({ size = 280, spin = true, glow = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rotY = spin ? (frame / fps) * 60 : 0;
  const rotX = spin ? 15 + Math.sin(frame / 30) * 5 : 15;
  const pulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.85, 1]);

  const half = size / 2;
  const face = (transform: string, bg: string) => (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        border: "2px solid rgba(244, 114, 182, 0.9)",
        background: bg,
        boxShadow: "inset 0 0 40px rgba(168, 85, 247, 0.4)",
        transform,
      }}
    />
  );

  return (
    <div
      style={{
        perspective: 1200,
        width: size,
        height: size,
        filter: glow
          ? `drop-shadow(0 0 ${30 * pulse}px rgba(168, 85, 247, 0.7)) drop-shadow(0 0 ${
              60 * pulse
            }px rgba(244, 114, 182, 0.4))`
          : undefined,
      }}
    >
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          transformStyle: "preserve-3d",
          transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
        }}
      >
        {face(`translateZ(${half}px)`, "rgba(168, 85, 247, 0.10)")}
        {face(`rotateY(180deg) translateZ(${half}px)`, "rgba(168, 85, 247, 0.10)")}
        {face(`rotateY(90deg) translateZ(${half}px)`, "rgba(244, 114, 182, 0.10)")}
        {face(`rotateY(-90deg) translateZ(${half}px)`, "rgba(244, 114, 182, 0.10)")}
        {face(`rotateX(90deg) translateZ(${half}px)`, "rgba(6, 182, 212, 0.10)")}
        {face(`rotateX(-90deg) translateZ(${half}px)`, "rgba(6, 182, 212, 0.10)")}
      </div>
    </div>
  );
};
