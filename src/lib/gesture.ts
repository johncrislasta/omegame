export type Gesture = "rock" | "paper" | "scissors";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

type Finger = "index" | "middle" | "ring" | "pinky";

const WRIST = 0;
const TIP: Record<Finger, number> = { index: 8, middle: 12, ring: 16, pinky: 20 };
const PIP: Record<Finger, number> = { index: 6, middle: 10, ring: 14, pinky: 18 };

const FINGERS: Finger[] = ["index", "middle", "ring", "pinky"];

const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function extensionScore(landmarks: Landmark[], finger: Finger): number {
  const wrist = landmarks[WRIST];
  const pip = landmarks[PIP[finger]];
  const tip = landmarks[TIP[finger]];
  const pipDist = distance(pip, wrist);
  if (pipDist === 0) return 0;
  return (distance(tip, wrist) - pipDist) / pipDist;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function classifyGesture(landmarks: Landmark[]): { gesture: Gesture; confidence: number } | null {
  if (landmarks.length < 21) return null;

  const scores = {
    index: extensionScore(landmarks, "index"),
    middle: extensionScore(landmarks, "middle"),
    ring: extensionScore(landmarks, "ring"),
    pinky: extensionScore(landmarks, "pinky"),
  };

  const EXTENDED = 0.15;
  const CURLED = -0.15;

  const allCurled = FINGERS.every((f) => scores[f] < CURLED);
  if (allCurled) {
    return { gesture: "rock", confidence: clamp(Math.min(...FINGERS.map((f) => -scores[f]))) };
  }

  const allExtended = FINGERS.every((f) => scores[f] > EXTENDED);
  if (allExtended) {
    return { gesture: "paper", confidence: clamp(Math.min(...FINGERS.map((f) => scores[f]))) };
  }

  const isScissors =
    scores.index > EXTENDED &&
    scores.middle > EXTENDED &&
    scores.ring < CURLED &&
    scores.pinky < CURLED;
  if (isScissors) {
    return {
      gesture: "scissors",
      confidence: clamp(Math.min(scores.index, scores.middle, -scores.ring, -scores.pinky)),
    };
  }

  return null;
}
