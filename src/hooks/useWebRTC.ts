"use client";

import { useRef, useState, useCallback, useEffect } from "react";

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let cachedIceServers: RTCIceServer[] | null = null;

async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;

  const apiKey = process.env.NEXT_PUBLIC_METERED_API_KEY;
  if (!apiKey) {
    cachedIceServers = FALLBACK_ICE_SERVERS;
    return cachedIceServers;
  }

  try {
    const res = await fetch(
      `https://openrelayproject.metered.ca/api/v1/turn/credentials?apiKey=${apiKey}`
    );
    if (!res.ok) throw new Error(`TURN API ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      cachedIceServers = data;
      return cachedIceServers;
    }
  } catch {
    console.warn("[WebRTC] Failed to fetch TURN credentials, using STUN only");
  }

  cachedIceServers = FALLBACK_ICE_SERVERS;
  return cachedIceServers;
}

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isReady: boolean;
  setupPeerConnection: (partnerId: string) => void;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  handleOffer: (offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>;
  handleAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  setLocalStreamDirect: (stream: MediaStream) => void;
  cleanup: () => void;
}

export function useWebRTC(
  socketEmit: (event: string, data?: unknown) => void,
): UseWebRTCReturn {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const partnerIdRef = useRef<string | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const setupPeerConnection = useCallback(
    async (partnerId: string) => {
      if (pcRef.current) {
        pcRef.current.close();
      }
      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      partnerIdRef.current = partnerId;
      pendingCandidates.current = [];
      setIsReady(false);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketEmit("ice-candidate", { to: partnerId, candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        if (event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setIsReady(true);
        }
      };
    },
    [socketEmit]
  );

  const waitForLocalStream = useCallback((): Promise<MediaStream> => {
    if (localStreamRef.current) return Promise.resolve(localStreamRef.current);
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (localStreamRef.current) return resolve(localStreamRef.current);
        if (Date.now() - start > 10000) return reject(new Error("Timed out waiting for local stream"));
        setTimeout(check, 50);
      };
      check();
    });
  }, []);

  const createOffer = useCallback(async (): Promise<RTCSessionDescriptionInit> => {
    const pc = pcRef.current;
    if (!pc) throw new Error("No peer connection");

    const stream = await waitForLocalStream();

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }, [waitForLocalStream]);

  const handleOffer = useCallback(
    async (offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> => {
      const pc = pcRef.current;
      if (!pc) throw new Error("No peer connection");

      const stream = await waitForLocalStream();

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      for (const c of pendingCandidates.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer;
    },
    []
  );

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (pcRef.current) {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      for (const c of pendingCandidates.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates.current = [];
    }
  }, []);

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (pcRef.current?.remoteDescription) {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      pendingCandidates.current.push(candidate);
    }
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIsReady(false);
    partnerIdRef.current = null;
    pendingCandidates.current = [];
  }, []);

  const setLocalStreamDirect = useCallback((stream: MediaStream) => {
    localStreamRef.current = stream;
    setLocalStream(stream);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    localStream,
    remoteStream,
    isReady,
    setupPeerConnection,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    setLocalStreamDirect,
    cleanup,
  };
}
