import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

export const GridBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const offset = (frame * 0.6) % 80;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 70% 30%, ${COLORS.navyMid} 0%, ${COLORS.navy} 55%, ${COLORS.navyDeep} 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${COLORS.goldGlow.replace("0.35", "0.06")} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.goldGlow.replace("0.35", "0.06")} 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          backgroundPosition: `${offset}px ${offset}px`,
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />
    </AbsoluteFill>
  );
};
