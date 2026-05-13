import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { syne, inter } from "../fonts";
import { COLORS } from "../theme";

const PILARES = [
  { icon: "◈", title: "IA de Placas", desc: "YOLO + OCR em tempo real, 100% no dispositivo" },
  { icon: "⛨", title: "100% Local", desc: "Sem nuvem, sem mensalidade, LGPD-ready" },
  { icon: "◉", title: "Vigilância 360°", desc: "Detecção de pessoas e alertas em tempo real" },
  { icon: "▤", title: "Relatórios & BI", desc: "Dashboards, exportação PDF e estatísticas" },
];

const Card: React.FC<{ idx: number; pilar: typeof PILARES[0] }> = ({ idx, pilar }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = idx * 8;
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 130 } });
  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(15,31,61,0.85), rgba(10,22,40,0.85))",
        border: `1px solid ${COLORS.goldGlow}`,
        borderRadius: 18,
        padding: 48,
        opacity: s,
        transform: `translateY(${(1 - s) * 40}px) scale(${0.95 + s * 0.05})`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontFamily: syne, fontSize: 64, color: COLORS.gold, marginBottom: 20 }}>{pilar.icon}</div>
      <div style={{ fontFamily: syne, fontWeight: 700, fontSize: 40, color: COLORS.cream, marginBottom: 14 }}>{pilar.title}</div>
      <div style={{ fontFamily: inter, fontSize: 22, color: COLORS.muted, lineHeight: 1.5 }}>{pilar.desc}</div>
    </div>
  );
};

export const ScenePilares: React.FC = () => {
  const frame = useCurrentFrame();
  const tagOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ padding: 100, justifyContent: "center" }}>
      <div style={{ fontFamily: inter, fontSize: 22, letterSpacing: 8, color: COLORS.gold, textTransform: "uppercase", opacity: tagOp, marginBottom: 16 }}>
        Quatro pilares
      </div>
      <div style={{ fontFamily: syne, fontWeight: 700, fontSize: 72, color: COLORS.cream, opacity: tagOp, letterSpacing: -1, marginBottom: 50 }}>
        Tudo que sua portaria precisa
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {PILARES.map((p, i) => <Card key={i} idx={i} pilar={p} />)}
      </div>
    </AbsoluteFill>
  );
};
