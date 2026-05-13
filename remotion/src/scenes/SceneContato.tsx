import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { syne, inter } from "../fonts";
import { COLORS } from "../theme";

export const SceneContato: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 20 } });
  const lineW = interpolate(frame, [10, 40], [0, 600], { extrapolateRight: "clamp" });
  const cardS = spring({ frame: frame - 20, fps, config: { damping: 18, stiffness: 140 } });
  const sysOp = interpolate(frame, [50, 75], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <div style={{ fontFamily: inter, fontSize: 22, letterSpacing: 10, color: COLORS.gold, textTransform: "uppercase", opacity: s, marginBottom: 30 }}>
        Fale com o consultor
      </div>
      <div
        style={{
          fontFamily: syne,
          fontWeight: 800,
          fontSize: 130,
          color: COLORS.cream,
          opacity: s,
          transform: `translateY(${(1 - s) * 30}px)`,
          letterSpacing: -2,
        }}
      >
        Cristian Sales
      </div>
      <div
        style={{
          height: 3,
          width: lineW,
          background: `linear-gradient(90deg, transparent, ${COLORS.gold}, transparent)`,
          margin: "30px 0",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          padding: "26px 56px",
          background: "linear-gradient(135deg, #25D366, #128C7E)",
          borderRadius: 20,
          opacity: cardS,
          transform: `translateY(${(1 - cardS) * 40}px) scale(${0.9 + cardS * 0.1})`,
          boxShadow: "0 20px 60px rgba(37,211,102,0.4)",
        }}
      >
        <div style={{ fontSize: 64 }}>💬</div>
        <div>
          <div style={{ fontFamily: inter, fontSize: 18, color: "rgba(255,255,255,0.85)", letterSpacing: 3, textTransform: "uppercase" }}>
            WhatsApp
          </div>
          <div style={{ fontFamily: syne, fontWeight: 700, fontSize: 56, color: "#fff", letterSpacing: 1 }}>
            (11) 94175-8759
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 60,
          fontFamily: syne,
          fontWeight: 600,
          fontSize: 32,
          color: COLORS.gold,
          opacity: sysOp,
          letterSpacing: 2,
          textAlign: "center",
        }}
      >
        Sistema de Controle de Acesso
        <div style={{ fontSize: 20, color: COLORS.muted, marginTop: 6, letterSpacing: 6, textTransform: "uppercase" }}>
          Águas da Fonte
        </div>
      </div>
    </AbsoluteFill>
  );
};
