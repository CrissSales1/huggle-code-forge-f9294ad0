import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { GridBackground } from "./components/GridBackground";
import { GoldGlow } from "./components/GoldGlow";
import { SceneIntro } from "./scenes/SceneIntro";
import { SceneProblema } from "./scenes/SceneProblema";
import { SceneLPR } from "./scenes/SceneLPR";
import { ScenePilares } from "./scenes/ScenePilares";
import { SceneDashboard } from "./scenes/SceneDashboard";
import { ScenePremium } from "./scenes/ScenePremium";
import { SceneContato } from "./scenes/SceneContato";

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#070F1F" }}>
      <GridBackground />
      <GoldGlow />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={85}><SceneIntro /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={75}><SceneProblema /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={120}><SceneLPR /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={linearTiming({ durationInFrames: 18 })} />
        <TransitionSeries.Sequence durationInFrames={120}><ScenePilares /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={110}><SceneDashboard /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 14 })} />
        <TransitionSeries.Sequence durationInFrames={70}><ScenePremium /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 14 })} />
        <TransitionSeries.Sequence durationInFrames={110}><SceneContato /></TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
