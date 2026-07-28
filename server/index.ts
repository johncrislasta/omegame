import { Server } from "socket.io";
import { createServer } from "http";

const port = parseInt(process.env.PORT || "3001", 10);
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin.split(","),
    methods: ["GET", "POST"],
  },
});

httpServer.listen(port, () => {
  console.log(`[Server] Signaling server running on http port ${port}`);
});

interface WaitingUser {
  socketId: string;
  joinedAt: number;
  mode: "video" | "text";
}

const waitingQueues: { video: WaitingUser[]; text: WaitingUser[] } = { video: [], text: [] };
const activeRooms = new Map<string, { user1: string; user2: string }>();
const userToRoom = new Map<string, string>();

let onlineCount = 0;

function broadcastOnlineCount() {
  io.emit("online-count", onlineCount);
}

function findPartner(socketId: string, mode: "video" | "text") {
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

    return { user1: partner.socketId, user2: socketId, roomId };
  }

  const alreadyWaiting = queue.some((w) => w.socketId === socketId);
  if (!alreadyWaiting) {
    queue.push({ socketId, joinedAt: now, mode });
  }

  return null;
}

io.on("connection", (socket) => {
  onlineCount++;
  broadcastOnlineCount();
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("find-stranger", (data?: { mode?: string }) => {
    const mode = data?.mode === "text" ? "text" : "video";
    console.log(`[Server] ${socket.id} looking for stranger (${mode})`);
    const result = findPartner(socket.id, mode);

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

  socket.on("game-play-again", ({ to }: { to: string }) => {
    io.to(to).emit("game-play-again", { from: socket.id });
  });

  socket.on("game-play-again-accept", ({ to }: { to: string }) => {
    io.to(to).emit("game-play-again-accept", { from: socket.id });
  });

  socket.on("game-play-again-reject", ({ to }: { to: string }) => {
    io.to(to).emit("game-play-again-reject", { from: socket.id });
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

  socket.on("disconnect", () => {
    onlineCount = Math.max(0, onlineCount - 1);
    broadcastOnlineCount();
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
