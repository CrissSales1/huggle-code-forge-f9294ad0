import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export const GoldGlow: React.FC = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 600], [-200, 200]);
  const y = interpolate(frame, [0, 600], [100, -100]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${20 + x * 0.05}%`,
          top: `${15 + y * 0.05}%`,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(212,175,55,0.18) 0%, transparent 60%)",
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: `${10 - x * 0.03}%`,
          bottom: `${10 + y * 0.04}%`,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(22,51,92,0.5) 0%, transparent 60%)",
          filter: "blur(30px)",
        }}
      />
    </AbsoluteFill>
  );
};
