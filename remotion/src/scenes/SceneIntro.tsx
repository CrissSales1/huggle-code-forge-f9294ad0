import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { syne, inter } from "../fonts";
import { COLORS } from "../theme";

export const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleBlur = interpolate(frame, [0, 25], [20, 0], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const subY = spring({ frame: frame - 18, fps, config: { damping: 20, stiffness: 120 } });
  const lineW = interpolate(frame, [10, 50], [0, 100], { extrapolateRight: "clamp" });
  const tagOp = interpolate(frame, [40, 60], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "center", paddingLeft: 160 }}>
      <div
        style={{
          fontFamily: inter,
          fontSize: 22,
          letterSpacing: 8,
          color: COLORS.gold,
          textTransform: "uppercase",
          opacity: tagOp,
          marginBottom: 28,
        }}
      >
        Premium · Tecnologia · 100% Local
      </div>
      <div
        style={{
          fontFamily: syne,
          fontWeight: 800,
          fontSize: 130,
          lineHeight: 1.0,
          color: COLORS.cream,
          opacity: titleOpacity,
          filter: `blur(${titleBlur}px)`,
          letterSpacing: -2,
          maxWidth: 1400,
        }}
      >
        Sistema de<br />Controle de Acesso
      </div>
      <div
        style={{
          height: 3,
          width: `${lineW * 4}px`,
          background: `linear-gradient(90deg, ${COLORS.gold}, transparent)`,
          marginTop: 32,
          marginBottom: 24,
        }}
      />
      <div
        style={{
          fontFamily: syne,
          fontWeight: 600,
          fontSize: 56,
          color: COLORS.gold,
          transform: `translateY(${(1 - subY) * 30}px)`,
          opacity: subY,
          letterSpacing: 1,
        }}
      >
        Águas da Fonte
      </div>
    </AbsoluteFill>
  );
};
