import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

export const syne = loadSyne("normal", { weights: ["600", "700", "800"] }).fontFamily;
export const inter = loadInter("normal", { weights: ["400", "500", "600", "700"] }).fontFamily;
