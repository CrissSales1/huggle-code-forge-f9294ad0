import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { syne, inter } from "../fonts";
import { COLORS } from "../theme";

export const SceneLPR: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tagOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const boxScale = spring({ frame: frame - 10, fps, config: { damping: 18, stiffness: 140 } });
  const scanY = interpolate(frame, [20, 80], [0, 100], { extrapolateRight: "clamp" });
  const plateOp = interpolate(frame, [55, 75], [0, 1], { extrapolateRight: "clamp" });
  const labelOp = interpolate(frame, [70, 90], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: 100, left: 160, fontFamily: inter, fontSize: 22, letterSpacing: 8, color: COLORS.gold, textTransform: "uppercase", opacity: tagOp }}>
        A solução
      </div>
      <div style={{ position: "absolute", top: 150, left: 160, fontFamily: syne, fontWeight: 700, fontSize: 86, color: COLORS.cream, opacity: tagOp, letterSpacing: -1, maxWidth: 900 }}>
        Reconhecimento<br />automático por IA
      </div>

      <div
        style={{
          position: "relative",
          width: 760,
          height: 380,
          marginLeft: 700,
          marginTop: 80,
          transform: `scale(${boxScale})`,
          background: "linear-gradient(135deg, #0d2240 0%, #050a14 100%)",
          borderRadius: 18,
          border: `2px solid ${COLORS.gold}`,
          boxShadow: `0 0 80px rgba(212,175,55,0.25), inset 0 0 60px rgba(0,0,0,0.6)`,
          overflow: "hidden",
        }}
      >
        {/* corner brackets */}
        {[
          { top: 20, left: 20, borderTop: 3, borderLeft: 3 },
          { top: 20, right: 20, borderTop: 3, borderRight: 3 },
          { bottom: 20, left: 20, borderBottom: 3, borderLeft: 3 },
          { bottom: 20, right: 20, borderBottom: 3, borderRight: 3 },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 50,
              height: 50,
              borderColor: COLORS.gold,
              borderStyle: "solid",
              borderWidth: 0,
              ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "number" && k.startsWith("border") ? `${v}px` : v])),
            } as React.CSSProperties}
          />
        ))}
        {/* scan line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${scanY}%`,
            height: 3,
            background: `linear-gradient(90deg, transparent, ${COLORS.gold}, transparent)`,
            boxShadow: `0 0 20px ${COLORS.gold}`,
          }}
        />
        {/* plate mock */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 420,
            height: 130,
            background: COLORS.cream,
            borderRadius: 10,
            border: "4px solid #1a1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: plateOp,
            fontFamily: "monospace",
            fontSize: 78,
            fontWeight: 800,
            color: "#0a0a0a",
            letterSpacing: 6,
          }}
        >
          ABC-1D23
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 120,
          right: 200,
          opacity: labelOp,
          fontFamily: inter,
          fontSize: 28,
          color: COLORS.gold,
          textAlign: "right",
        }}
      >
        ✓ Veículo reconhecido em <strong>0.4s</strong>
      </div>
    </AbsoluteFill>
  );
};
