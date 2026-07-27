import { createServer } from "https";
import { readFileSync } from "fs";
import { resolve } from "path";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = 3000;

const certDir = resolve(import.meta.dirname ?? __dirname, "certificates");
const httpsServer = createServer({
  key: readFileSync(resolve(certDir, "localhost-key.pem")),
  cert: readFileSync(resolve(certDir, "localhost.pem")),
});

const io = new Server(httpsServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

interface WaitingUser {
  socketId: string;
  joinedAt: number;
}

const waitingQueue: WaitingUser[] = [];
const activeRooms = new Map<string, { user1: string; user2: string }>();
const userToRoom = new Map<string, string>();

function findPartner(socketId: string) {
  const now = Date.now();

  const filtered = waitingQueue.filter((w) => w.socketId !== socketId);

  if (filtered.length > 0) {
    const partner = filtered[0];
    waitingQueue.length = 0;
    waitingQueue.push(...filtered.filter((w) => w.socketId !== partner.socketId));

    const roomId = `room-${partner.socketId}-${socketId}`;
    activeRooms.set(roomId, { user1: partner.socketId, user2: socketId });
    userToRoom.set(partner.socketId, roomId);
    userToRoom.set(socketId, roomId);

    return { user1: partner.socketId, user2: socketId, roomId };
  }

  const alreadyWaiting = waitingQueue.some((w) => w.socketId === socketId);
  if (!alreadyWaiting) {
    waitingQueue.push({ socketId, joinedAt: now });
  }

  return null;
}

io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("find-stranger", () => {
    console.log(`[Server] ${socket.id} looking for stranger`);
    const result = findPartner(socket.id);

    if (result) {
      io.to(result.user1).emit("matched", { partnerId: result.user2, roomId: result.roomId, isInitiator: true });
      io.to(result.user2).emit("matched", { partnerId: result.user1, roomId: result.roomId, isInitiator: false });
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

    const queueIdx = waitingQueue.findIndex((w) => w.socketId === socket.id);
    if (queueIdx !== -1) waitingQueue.splice(queueIdx, 1);
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
    console.log(`[Server] User disconnected: ${socket.id}`);

    const queueIdx = waitingQueue.findIndex((w) => w.socketId === socket.id);
    if (queueIdx !== -1) waitingQueue.splice(queueIdx, 1);

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
  httpsServer.on("request", (req, res) => {
    handle(req, res);
  });

  httpsServer.listen(port, () => {
    console.log(`> Ready on https://${hostname}:${port}`);
  });
});
