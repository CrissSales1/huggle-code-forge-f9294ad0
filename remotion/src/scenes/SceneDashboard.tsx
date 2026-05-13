import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { syne, inter } from "../fonts";
import { COLORS } from "../theme";

const KPI: React.FC<{ label: string; value: number; suffix?: string; delay: number }> = ({ label, value, suffix = "", delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 20 } });
  const num = Math.round(interpolate(frame, [delay, delay + 40], [0, value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * 20}px)` }}>
      <div style={{ fontFamily: syne, fontWeight: 800, fontSize: 96, color: COLORS.gold, lineHeight: 1, letterSpacing: -2 }}>
        {num.toLocaleString("pt-BR")}{suffix}
      </div>
      <div style={{ fontFamily: inter, fontSize: 22, color: COLORS.muted, marginTop: 8, textTransform: "uppercase", letterSpacing: 2 }}>
        {label}
      </div>
    </div>
  );
};

const Bar: React.FC<{ h: number; delay: number }> = ({ h, delay }) => {
  const frame = useCurrentFrame();
  const grow = interpolate(frame, [delay, delay + 25], [0, h], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        width: 36,
        height: grow,
        background: `linear-gradient(180deg, ${COLORS.gold}, ${COLORS.goldLight})`,
        borderRadius: "4px 4px 0 0",
      }}
    />
  );
};

export const SceneDashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const tagOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const bars = [80, 130, 95, 170, 140, 200, 175, 220, 190, 260, 230, 280];
  return (
    <AbsoluteFill style={{ padding: 100, justifyContent: "center" }}>
      <div style={{ fontFamily: inter, fontSize: 22, letterSpacing: 8, color: COLORS.gold, textTransform: "uppercase", opacity: tagOp, marginBottom: 16 }}>
        Inteligência operacional
      </div>
      <div style={{ fontFamily: syne, fontWeight: 700, fontSize: 72, color: COLORS.cream, opacity: tagOp, letterSpacing: -1, marginBottom: 60 }}>
        Decisões com dados
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 60, marginBottom: 70 }}>
        <KPI label="Visitantes / mês" value={1248} delay={10} />
        <KPI label="Veículos reconhecidos" value={4732} delay={20} />
        <KPI label="Precisão LPR" value={99} suffix="%" delay={30} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 18,
          height: 300,
          padding: "30px 40px",
          background: "rgba(10,22,40,0.6)",
          border: `1px solid ${COLORS.goldGlow}`,
          borderRadius: 16,
        }}
      >
        {bars.map((h, i) => <Bar key={i} h={h} delay={40 + i * 3} />)}
      </div>
    </AbsoluteFill>
  );
};
