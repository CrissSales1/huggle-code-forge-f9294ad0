import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { syne, inter } from "../fonts";
import { COLORS } from "../theme";

const Word: React.FC<{ text: string; delay: number; struck: boolean }> = ({ text, delay, struck }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = spring({ frame: frame - delay, fps, config: { damping: 20 } });
  const strikeW = interpolate(frame, [delay + 18, delay + 35], [0, 100], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  return (
    <div style={{ position: "relative", display: "inline-block", marginRight: 30, opacity: op, transform: `translateY(${(1 - op) * 20}px)` }}>
      <span style={{ color: struck ? COLORS.muted : COLORS.cream }}>{text}</span>
      {struck && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "55%",
            height: 6,
            width: `${strikeW}%`,
            background: COLORS.gold,
            borderRadius: 3,
          }}
        />
      )}
    </div>
  );
};

export const SceneProblema: React.FC = () => {
  const frame = useCurrentFrame();
  const tagOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "center", paddingLeft: 160 }}>
      <div style={{ fontFamily: inter, fontSize: 22, letterSpacing: 8, color: COLORS.gold, textTransform: "uppercase", opacity: tagOp, marginBottom: 40 }}>
        O problema
      </div>
      <div style={{ fontFamily: syne, fontWeight: 700, fontSize: 110, lineHeight: 1.1, letterSpacing: -1 }}>
        <Word text="Portarias manuais." delay={5} struck />
        <br />
        <Word text="Filas." delay={25} struck />
        <Word text="Erros." delay={35} struck />
        <Word text="Riscos." delay={45} struck />
      </div>
    </AbsoluteFill>
  );
};
