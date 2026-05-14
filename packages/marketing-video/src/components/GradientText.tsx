import React from "react";
import { fontStack, theme } from "../theme";

type Props = {
  children: React.ReactNode;
  size?: number;
  weight?: number;
  letterSpacing?: string;
  uppercase?: boolean;
};

export const GradientText: React.FC<Props> = ({
  children,
  size = 96,
  weight = 800,
  letterSpacing = "-0.02em",
  uppercase = false,
}) => {
  return (
    <span
      style={{
        fontFamily: fontStack,
        fontSize: size,
        fontWeight: weight,
        letterSpacing,
        textTransform: uppercase ? "uppercase" : "none",
        backgroundImage: theme.gradientTitle,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        lineHeight: 1.05,
        textAlign: "center",
        textShadow: "0 0 30px rgba(168, 85, 247, 0.3)",
      }}
    >
      {children}
    </span>
  );
};
