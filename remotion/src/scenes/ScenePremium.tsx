import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { syne, inter } from "../fonts";
import { COLORS } from "../theme";

export const ScenePremium: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 5, fps, config: { damping: 16, stiffness: 120 } });
  const ringRot = interpolate(frame, [0, 60], [0, 360]);
  const subOp = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", transform: `scale(${s})`, opacity: s }}>
        {/* rotating ring */}
        <div
          style={{
            position: "absolute",
            inset: -60,
            border: `2px dashed ${COLORS.gold}`,
            borderRadius: "50%",
            transform: `rotate(${ringRot}deg)`,
            opacity: 0.5,
          }}
        />
        <div
          style={{
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${COLORS.gold} 0%, ${COLORS.goldLight} 60%, transparent 100%)`,
            boxShadow: "0 0 120px rgba(212,175,55,0.5)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.navy,
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: syne, fontWeight: 800, fontSize: 110, lineHeight: 0.95 }}>100%</div>
          <div style={{ fontFamily: syne, fontWeight: 700, fontSize: 52, marginTop: 8, letterSpacing: 4 }}>LOCAL</div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 180,
          fontFamily: inter,
          fontWeight: 600,
          fontSize: 32,
          color: COLORS.cream,
          letterSpacing: 6,
          textTransform: "uppercase",
          opacity: subOp,
        }}
      >
        Sem nuvem · Sem mensalidade · LGPD-ready
      </div>
    </AbsoluteFill>
  );
};
