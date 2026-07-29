import { createServer as createHttpsServer } from "https";
import { createServer as createHttpServer } from "http";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import next from "next";
import { Server } from "socket.io";

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

let totalConnected = 0;
const userModes = new Map<string, "video" | "text">();

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
  io.emit("online-count", { total: totalConnected, video, text, countries });
}

interface WaitingUser {
  socketId: string;
  joinedAt: number;
  mode: "video" | "text";
  country?: string;
}

const waitingQueues: { video: WaitingUser[]; text: WaitingUser[] } = { video: [], text: [] };
const activeRooms = new Map<string, { user1: string; user2: string }>();
const userToRoom = new Map<string, string>();
const userCountry = new Map<string, string>();
const userFeedbackReceived = new Map<string, { type: string; category: string; isPositive: boolean; timestamp: number }[]>();
const userFeedbackGiven = new Map<string, { type: string; category: string; isPositive: boolean; timestamp: number }[]>();

function findPartner(socketId: string, mode: "video" | "text", country?: string) {
  const now = Date.now();
  const queue = waitingQueues[mode];

  const filtered = queue.filter((w) => w.socketId !== socketId);

  if (filtered.length > 0) {
    const partner = filtered[0];
    queue.length = 0;
    queue.push(...filtered.filter((w) => w.socketId !== partner.socketId));

    const roomId = `room-${partner.socketId}-${socketId}`;
    activeRooms.set(roomId, { user1: partner.socketId, user2: socketId });
    userToRoom.set(partner.socketId, roomId);
    userToRoom.set(socketId, roomId);

    return {
      user1: partner.socketId,
      user2: socketId,
      roomId,
      country1: partner.country,
      country2: country,
    };
  }

  const alreadyWaiting = queue.some((w) => w.socketId === socketId);
  if (!alreadyWaiting) {
    queue.push({ socketId, joinedAt: now, mode, country });
  }

  return null;
}

io.on("connection", (socket) => {
  totalConnected++;
  broadcastOnlineCount();
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("set-country", (country: string) => {
    if (typeof country === "string" && country.length === 2) {
      userCountry.set(socket.id, country.toUpperCase());
    }
  });

  socket.on("find-stranger", (data?: { mode?: string; country?: string }) => {
    const mode = data?.mode === "text" ? "text" : "video";
    userModes.set(socket.id, mode);
    broadcastOnlineCount();
    console.log(`[Server] ${socket.id} looking for stranger (${mode})`);
    const result = findPartner(socket.id, mode, userCountry.get(socket.id));

    if (result) {
      io.to(result.user1).emit("matched", { partnerId: result.user2, roomId: result.roomId, isInitiator: true, partnerCountry: result.country2 });
      io.to(result.user2).emit("matched", { partnerId: result.user1, roomId: result.roomId, isInitiator: false, partnerCountry: result.country1 });
      console.log(`[Server] Paired: ${result.user1} <-> ${result.user2}`);
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
    totalConnected = Math.max(0, totalConnected - 1);
    userModes.delete(socket.id);
    broadcastOnlineCount();
    userCountry.delete(socket.id);
    userFeedbackReceived.delete(socket.id);
    userFeedbackGiven.delete(socket.id);
    console.log(`[Server] User disconnected: ${socket.id}`);

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
  });
});

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  server.on("request", (req, res) => {
    handle(req, res);
  });

  server.listen(port, () => {
    console.log(`> Ready on ${useHttps ? "https" : "http"}://${hostname}:${port}`);
  });
});
