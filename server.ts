import { createServer as createHttpsServer } from "https";
import { createServer as createHttpServer } from "http";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import next from "next";
import { Server, Socket } from "socket.io";
import { SocketTracker } from "./src/lib/socketTracking";
import { ensureTables, cleanupOrphaned, setLiveCount, maybeSaveLiveSnapshot } from "./src/lib/analytics";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const certDir = resolve(import.meta.dirname ?? __dirname, "certificates");
const keyPath = resolve(certDir, "localhost-key.pem");
const certPath = resolve(certDir, "localhost.pem");

const useHttps = existsSync(keyPath) && existsSync(certPath);

const server = useHttps
  ? createHttpsServer({
      key: readFileSync(keyPath),
      cert: readFileSync(certPath),
    })
  : createHttpServer();

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

const tracker = new SocketTracker();
const userModes = new Map<string, "video" | "text">();

function getClientIp(socket: Socket): string | undefined {
  const fwd = socket.handshake.headers["x-forwarded-for"];
  const forwarded = Array.isArray(fwd) ? fwd[0] : fwd;
  const raw = (forwarded || socket.handshake.address || "").trim();
  if (!raw) return undefined;
  return raw.replace(/^::ffff:/, "") || undefined;
}

function broadcastOnlineCount() {
  let video = 0;
  let text = 0;
  const countries: Record<string, number> = {};
  for (const [sid, mode] of userModes) {
    if (mode === "video") video++;
    else if (mode === "text") text++;
    const country = userCountry.get(sid);
    if (country) {
      countries[country] = (countries[country] || 0) + 1;
    }
  }
  const count = { total: tracker.totalSessions, video, text, countries, topInterests: getTopInterests(10) };
  io.emit("online-count", count);
  setLiveCount({ total: tracker.totalSessions, video, text, countries });
  maybeSaveLiveSnapshot({ total: tracker.totalSessions, video, text, countries });
}

interface WaitingUser {
  socketId: string;
  joinedAt: number;
  mode: "video" | "text";
  country?: string;
  interests?: string[];
}

const waitingQueues: { video: WaitingUser[]; text: WaitingUser[] } = { video: [], text: [] };
const activeRooms = new Map<string, { user1: string; user2: string }>();
const userToRoom = new Map<string, string>();
const userCountry = new Map<string, string>();
const userFeedbackReceived = new Map<string, { type: string; category: string; isPositive: boolean; timestamp: number }[]>();
const userFeedbackGiven = new Map<string, { type: string; category: string; isPositive: boolean; timestamp: number }[]>();
const userInterests = new Map<string, string[]>();
const interestCounts = new Map<string, number>();

const RPS_BUFFER_MS = 1000;
const rpsSubmissions = new Map<
  string,
  { aId: string; aChoice: string | null; bId: string | null; bChoice: string | null; nonce: number; timer: ReturnType<typeof setTimeout> }
>();

function rpsPairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function rpsWinner(a: string, b: string): "win" | "lose" | "draw" {
  if (a === b) return "draw";
  if ((a === "rock" && b === "scissors") || (a === "scissors" && b === "paper") || (a === "paper" && b === "rock")) return "win";
  return "lose";
}

function resolveRpsRound(key: string) {
  const entry = rpsSubmissions.get(key);
  if (!entry) return;
  rpsSubmissions.delete(key);
  clearTimeout(entry.timer);
  const resultA = entry.aChoice && entry.bChoice ? rpsWinner(entry.aChoice, entry.bChoice) : entry.aChoice ? "win" : entry.bChoice ? "lose" : "draw";
  const resultB = entry.bChoice && entry.aChoice ? rpsWinner(entry.bChoice, entry.aChoice) : entry.bChoice ? "win" : entry.aChoice ? "lose" : "draw";
  io.to(entry.aId).emit("rps-result", { nonce: entry.nonce, myChoice: entry.aChoice, oppChoice: entry.bChoice, result: resultA });
  if (entry.bId) {
    io.to(entry.bId).emit("rps-result", { nonce: entry.nonce, myChoice: entry.bChoice, oppChoice: entry.aChoice, result: resultB });
  }
  console.log(`[Server] RPS resolved round ${entry.nonce}: ${entry.aChoice ?? "null"} vs ${entry.bChoice ?? "null"}`);
}

function updateInterestCounts(socketId: string, newInterests: string[]) {
  const old = userInterests.get(socketId);
  if (old) {
    for (const i of old) {
      const c = interestCounts.get(i);
      if (c) interestCounts.set(i, c - 1);
    }
  }
  for (const i of newInterests) {
    interestCounts.set(i, (interestCounts.get(i) || 0) + 1);
  }
  userInterests.set(socketId, newInterests);
}

function getTopInterests(n: number): { interest: string; count: number }[] {
  return [...interestCounts.entries()]
    .filter(([, c]) => c > 0)
    .filter(([interest]) => !isProhibited(interest))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([interest, count]) => ({ interest, count }));
}

const prohibitedRaw: string[] = JSON.parse(readFileSync(resolve(import.meta.dirname ?? __dirname, "src/data/prohibited-interests.json"), "utf-8"));
const prohibitedSet = new Set(prohibitedRaw.map((s: string) => s.toLowerCase().trim()));

function normalizeInterest(s: string): string {
  return s.toLowerCase().trim();
}

function isProhibited(interest: string): boolean {
  return prohibitedSet.has(normalizeInterest(interest));
}

function hasProhibited(interests: string[]): boolean {
  return interests.some(isProhibited);
}

function allSafe(interests: string[]): boolean {
  return interests.length > 0 && interests.every((i) => !isProhibited(i));
}

function findPartner(socketId: string, mode: "video" | "text", country?: string, interests?: string[]) {
  const now = Date.now();
  const queue = waitingQueues[mode];
  const interestsArr = interests || userInterests.get(socketId) || [];
const userAllSafe = allSafe(interestsArr);

function isCompatible(aInterests: string[], aAllSafe: boolean, bInterests: string[], bAllSafe: boolean): boolean {
  if (aAllSafe && hasProhibited(bInterests)) return false;
  if (bAllSafe && hasProhibited(aInterests)) return false;
  return true;
}

const filtered = queue.filter((w) => w.socketId !== socketId);

  if (filtered.length > 0) {
    let partner: WaitingUser | undefined;

    if (interestsArr.length > 0) {
      partner = filtered.find((w) => {
        const wInterests = w.interests || userInterests.get(w.socketId) || [];
        if (!isCompatible(interestsArr, userAllSafe, wInterests, allSafe(wInterests))) return false;
        return wInterests.some((i) => interestsArr.includes(i));
      });
    }

    if (!partner) {
      partner = filtered.find((w) => {
        if (!isCompatible(interestsArr, userAllSafe, w.interests || userInterests.get(w.socketId) || [], allSafe(w.interests || userInterests.get(w.socketId) || []))) return false;
        return (now - w.joinedAt) >= 30000;
      });
    }

    if (!partner) {
      partner = filtered.find((w) => {
        if (!isCompatible(interestsArr, userAllSafe, w.interests || userInterests.get(w.socketId) || [], allSafe(w.interests || userInterests.get(w.socketId) || []))) return false;
        return true;
      });
    }

    if (partner) {
      queue.length = 0;
      queue.push(...filtered.filter((w) => w.socketId !== partner.socketId));

      const roomId = `room-${partner.socketId}-${socketId}`;
      activeRooms.set(roomId, { user1: partner.socketId, user2: socketId });
      userToRoom.set(partner.socketId, roomId);
      userToRoom.set(socketId, roomId);

      const wInterests = partner.interests || userInterests.get(partner.socketId) || [];
      const shared = interestsArr.filter((i) => wInterests.includes(i));

      return {
        user1: partner.socketId,
        user2: socketId,
        roomId,
        country1: partner.country,
        country2: country,
        sharedInterests: shared,
      };
    }
  }

  const alreadyWaiting = queue.some((w) => w.socketId === socketId);
  if (!alreadyWaiting) {
    queue.push({ socketId, joinedAt: now, mode, country, interests: interestsArr });
  }

  return null;
}

io.on("connection", (socket) => {
  const q = socket.handshake.query;
  socket.data.sessionId = tracker.onConnection(
    socket.id,
    typeof q.sessionId === "string" ? q.sessionId : undefined,
    typeof q.page === "string" ? q.page : "unknown",
    typeof q.country === "string" ? q.country : undefined,
    getClientIp(socket),
    typeof q.device === "string" ? q.device : undefined,
    typeof q.os === "string" ? q.os : undefined,
    typeof q.browser === "string" ? q.browser : undefined,
    typeof q.utmSource === "string" ? q.utmSource : undefined,
    typeof q.utmMedium === "string" ? q.utmMedium : undefined,
    typeof q.utmCampaign === "string" ? q.utmCampaign : undefined
  );
  broadcastOnlineCount();
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("set-country", (country: string) => {
    if (typeof country === "string" && country.length === 2) {
      userCountry.set(socket.id, country.toUpperCase());
      tracker.onSetCountry(socket.data.sessionId, country.toUpperCase());
    }
  });

  socket.on("find-stranger", (data?: { mode?: string; country?: string; interests?: string[] }) => {
    const mode = data?.mode === "text" ? "text" : "video";
    const interests = data?.interests || [];
    userModes.set(socket.id, mode);
    if (interests.length > 0) updateInterestCounts(socket.id, interests);
    tracker.onFindStranger(
      socket.data.sessionId,
      mode,
      userCountry.get(socket.id),
      getClientIp(socket),
      typeof q.device === "string" ? q.device : undefined,
      typeof q.os === "string" ? q.os : undefined,
      typeof q.browser === "string" ? q.browser : undefined,
      typeof q.utmSource === "string" ? q.utmSource : undefined,
      typeof q.utmMedium === "string" ? q.utmMedium : undefined,
      typeof q.utmCampaign === "string" ? q.utmCampaign : undefined
    );
    broadcastOnlineCount();
    console.log(`[Server] ${socket.id} looking for stranger (${mode})`);
    const result = findPartner(socket.id, mode, userCountry.get(socket.id), interests);

    if (result) {
      const { user1, user2, roomId, country1, country2, sharedInterests } = result;
      io.to(user1).emit("matched", { partnerId: user2, roomId, isInitiator: true, partnerCountry: country2, sharedInterests });
      io.to(user2).emit("matched", { partnerId: user1, roomId, isInitiator: false, partnerCountry: country1, sharedInterests });
      console.log(`[Server] Paired: ${user1} <-> ${user2} (shared: ${sharedInterests?.join(", ") || "none"})`);
    } else {
      socket.emit("waiting");
      console.log(`[Server] ${socket.id} added to queue`);
    }
  });

  socket.on("offer", ({ to, offer }: { to: string; offer: RTCSessionDescriptionInit }) => {
    console.log(`[Server] Relaying offer from ${socket.id} to ${to}`);
    io.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }: { to: string; answer: RTCSessionDescriptionInit }) => {
    console.log(`[Server] Relaying answer from ${socket.id} to ${to}`);
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }: { to: string; candidate: RTCIceCandidateInit }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("chat-message", ({ to, message }: { to: string; message: string }) => {
    io.to(to).emit("chat-message", { from: socket.id, message });
  });

  socket.on("feedback-send", ({ to, type, category, isPositive }: { to: string; type: string; category: string; isPositive: boolean }) => {
    const entry = { type, category, isPositive, timestamp: Date.now() };
    const received = userFeedbackReceived.get(to) || [];
    received.push(entry);
    userFeedbackReceived.set(to, received);
    const given = userFeedbackGiven.get(socket.id) || [];
    given.push(entry);
    userFeedbackGiven.set(socket.id, given);
    io.to(to).emit("feedback-received", { from: socket.id, type, category, isPositive });
  });

  socket.on("game-invite", ({ to, gameType }: { to: string; gameType: string }) => {
    console.log(`[Server] Game invite: ${socket.id} -> ${to} (${gameType})`);
    io.to(to).emit("game-invite", { from: socket.id, gameType });
  });

  socket.on("game-accept", ({ to }: { to: string }) => {
    console.log(`[Server] Game accepted: ${socket.id} -> ${to}`);
    io.to(to).emit("game-accept", { from: socket.id });
  });

  socket.on("game-state", ({ to, state }: { to: string; state: unknown }) => {
    io.to(to).emit("game-state", { from: socket.id, state });
  });

  socket.on("rps-submit", ({ to, nonce, choice }: { to: string; nonce: number; choice: string | null }) => {
    const from = socket.id;
    const key = `${rpsPairKey(from, to)}:${nonce}`;
    const existing = rpsSubmissions.get(key);
    if (!existing) {
      rpsSubmissions.set(key, {
        aId: from,
        aChoice: choice,
        bId: null,
        bChoice: null,
        nonce,
        timer: setTimeout(() => resolveRpsRound(key), RPS_BUFFER_MS),
      });
      console.log(`[Server] RPS submit ${from} (round ${nonce}): ${choice ?? "null"}`);
      return;
    }
    if (existing.aId === from) {
      existing.aChoice = choice;
      console.log(`[Server] RPS re-submit ${from} (round ${nonce}): ${choice ?? "null"}`);
    } else if (existing.bId === from) {
      existing.bChoice = choice;
      console.log(`[Server] RPS re-submit ${from} (round ${nonce}): ${choice ?? "null"}`);
    } else {
      existing.bId = from;
      existing.bChoice = choice;
      console.log(`[Server] RPS submit ${from} (round ${nonce}): ${choice ?? "null"}`);
      resolveRpsRound(key);
    }
  });

  socket.on("game-reject", ({ to }: { to: string }) => {
    io.to(to).emit("game-reject", { from: socket.id });
  });

  socket.on("game-end", ({ to }: { to: string }) => {
    io.to(to).emit("game-end", { from: socket.id });
  });

  socket.on("skip", () => {
    const roomId = userToRoom.get(socket.id);
    if (roomId) {
      const room = activeRooms.get(roomId);
      if (room) {
        const partnerId = room.user1 === socket.id ? room.user2 : room.user1;
        io.to(partnerId).emit("strangerDisconnected");
        userToRoom.delete(room.user1);
        userToRoom.delete(room.user2);
        activeRooms.delete(roomId);
      }
      socket.emit("disconnected");
    }

    for (const q of [waitingQueues.video, waitingQueues.text]) {
      const idx = q.findIndex((w) => w.socketId === socket.id);
      if (idx !== -1) q.splice(idx, 1);
    }
  });

  socket.on("game-play-again", ({ to }: { to: string }) => {
    io.to(to).emit("game-play-again", { from: socket.id });
  });

  socket.on("game-play-again-accept", ({ to }: { to: string }) => {
    io.to(to).emit("game-play-again-accept", { from: socket.id });
  });

  socket.on("game-play-again-reject", ({ to }: { to: string }) => {
    io.to(to).emit("game-play-again-reject", { from: socket.id });
  });

  socket.on("disconnect", () => {
    userModes.delete(socket.id);
    broadcastOnlineCount();
    userCountry.delete(socket.id);
    userFeedbackReceived.delete(socket.id);
    userFeedbackGiven.delete(socket.id);
    const oldInterests = userInterests.get(socket.id);
    if (oldInterests) {
      for (const i of oldInterests) {
        const c = interestCounts.get(i);
        if (c) interestCounts.set(i, c - 1);
      }
      userInterests.delete(socket.id);
    }
    console.log(`[Server] User disconnected: ${socket.id}`);

    for (const [key, entry] of rpsSubmissions) {
      if (entry.aId === socket.id || entry.bId === socket.id) {
        clearTimeout(entry.timer);
        rpsSubmissions.delete(key);
      }
    }

    for (const q of [waitingQueues.video, waitingQueues.text]) {
      const idx = q.findIndex((w) => w.socketId === socket.id);
      if (idx !== -1) q.splice(idx, 1);
    }

    const roomId = userToRoom.get(socket.id);
    if (roomId) {
      const room = activeRooms.get(roomId);
      if (room) {
        const partnerId = room.user1 === socket.id ? room.user2 : room.user1;
        io.to(partnerId).emit("strangerDisconnected");
        userToRoom.delete(room.user1);
        userToRoom.delete(room.user2);
        activeRooms.delete(roomId);
      }
    }

    tracker.onDisconnect(socket.id, socket.data.sessionId);
  });
});

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  server.on("request", (req, res) => {
    handle(req, res);
  });

  ensureTables()
    .then(() => cleanupOrphaned())
    .catch((err) => console.error("[Server] Analytics init error:", err));

  server.listen(port, () => {
    console.log(`> Ready on ${useHttps ? "https" : "http"}://${hostname}:${port}`);
  });
});
