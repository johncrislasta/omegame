"use client";

import { useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { classifyGesture, type Gesture, type Landmark } from "@/lib/gesture";

export type HandStatus = "idle" | "loading" | "ready" | "error";

const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let landmarkerPromise: Promise<HandLandmarker | null> | null = null;

function loadLandmarker(): Promise<HandLandmarker | null> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
      const options = {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" as const },
        runningMode: "VIDEO" as const,
        numHands: 1,
      };
      try {
        return await vision.HandLandmarker.createFromOptions(fileset, options);
      } catch {
        return await vision.HandLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: "CPU" },
        });
      }
    })();
    landmarkerPromise.catch(() => {
      landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

interface UseHandGestureOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  warmup?: boolean;
  minConfidence?: number;
  onDetect?: (gesture: Gesture | null) => void;
}

export function useHandGesture({
  videoRef,
  enabled,
  warmup = false,
  minConfidence = 0.35,
  onDetect,
}: UseHandGestureOptions) {
  const [status, setStatus] = useState<HandStatus>(() => (enabled || warmup ? "loading" : "idle"));
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [confidence, setConfidence] = useState(0);

  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const onDetectRef = useRef(onDetect);
  const minConfidenceRef = useRef(minConfidence);

  useEffect(() => {
    onDetectRef.current = onDetect;
    minConfidenceRef.current = minConfidence;
  });

  useEffect(() => {
    if (!enabled && !warmup) return;
    let cancelled = false;
    loadLandmarker()
      .then((lm) => {
        if (cancelled) return;
        landmarkerRef.current = lm;
        setStatus(lm ? "ready" : "error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, warmup]);

  useEffect(() => {
    if (status !== "ready" || !enabled) return;
    let raf = 0;
    let lastVideoTime = -1;

    const tick = (now: number) => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (video && video.readyState >= 2 && landmarker && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        let detected: Gesture | null = null;
        let conf = 0;
        try {
          const result = landmarker.detectForVideo(video, now);
          if (result.landmarks && result.landmarks.length > 0) {
            const c = classifyGesture(result.landmarks[0] as Landmark[]);
            if (c && c.confidence >= minConfidenceRef.current) {
              detected = c.gesture;
              conf = c.confidence;
            }
          }
        } catch {
          // skip frames that fail to process
        }
        setGesture(detected);
        setConfidence(conf);
        onDetectRef.current?.(detected);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, enabled, videoRef]);

  return { status, gesture, confidence };
}
