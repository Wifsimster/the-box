import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

export const GridBackground: React.FC<{ intensity?: number }> = ({
  intensity = 1,
}) => {
  const frame = useCurrentFrame();
  const offset = (frame * 0.6) % 80;
  const opacity = 0.18 * intensity;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0f", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: -80,
          backgroundImage: `
            linear-gradient(rgba(168, 85, 247, ${opacity}) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168, 85, 247, ${opacity}) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
          transform: `translate(${-offset}px, ${-offset}px)`,
        }}
      />
      {/* Radial neon vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(168, 85, 247, 0.18) 0%, rgba(10, 10, 15, 0) 65%)",
        }}
      />
    </AbsoluteFill>
  );
};
