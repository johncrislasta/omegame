import {
  createVisit,
  closeVisit,
  updateVisitCountry,
  markVisitBot,
  createChatSession,
  closeChatSession,
  updateChatSession,
} from "./analytics";

const BOT_VISIT_THRESHOLD_MS = parseInt(process.env.BOT_VISIT_THRESHOLD_MS || "1000", 10);

interface SessionState {
  sockets: Set<string>;
  startedAt: number;
  bot: boolean;
  ended: boolean;
  visitRowId?: string;
  chatRowId?: string;
}

export class SocketTracker {
  private sessions = new Map<string, SessionState>();

  get totalSessions(): number {
    return this.sessions.size;
  }

  onConnection(
    socketId: string,
    sessionId: string | undefined,
    page: string,
    country?: string,
    ip?: string,
    device?: string,
    os?: string,
    browser?: string,
    source?: string,
    medium?: string,
    campaign?: string
  ): string {
    if (!sessionId) sessionId = `sock:${socketId}`;
    const persist = !sessionId.startsWith("sock:");
    let st = this.sessions.get(sessionId);
    if (!st) {
      st = { sockets: new Set(), startedAt: Date.now(), bot: false, ended: false };
      this.sessions.set(sessionId, st);
      if (persist) {
        createVisit(sessionId, page || "unknown", country, ip, device, os, browser, source, medium, campaign).then((rowId) => {
          if (rowId && st) {
            st.visitRowId = rowId;
            if (st.ended) this.finishVisit(st);
          }
        });
      }
    }
    st.sockets.add(socketId);
    return sessionId;
  }

  onSetCountry(sessionId: string, country: string): void {
    const st = this.sessions.get(sessionId);
    if (st?.visitRowId) updateVisitCountry(st.visitRowId, country);
  }

  onFindStranger(sessionId: string, mode: string, country?: string, ip?: string, device?: string, os?: string, browser?: string, source?: string, medium?: string, campaign?: string): void {
    const st = this.sessions.get(sessionId);
    const existing = st?.chatRowId;
    if (existing) {
      updateChatSession(existing, mode, country);
      return;
    }
    createChatSession(sessionId, mode, country, ip, device, os, browser, source, medium, campaign).then((rowId) => {
      if (rowId && st) {
        st.chatRowId = rowId;
        if (st.ended) this.finishChat(st);
      }
    });
  }

  onDisconnect(socketId: string, sessionId: string): void {
    const st = this.sessions.get(sessionId);
    if (!st) return;
    st.sockets.delete(socketId);
    if (st.sockets.size > 0) return;
    st.ended = true;
    st.bot = Date.now() - st.startedAt < BOT_VISIT_THRESHOLD_MS;
    this.sessions.delete(sessionId);
    this.finishVisit(st);
    this.finishChat(st);
  }

  private finishVisit(st: SessionState): void {
    if (!st.visitRowId) return;
    if (st.bot) markVisitBot(st.visitRowId);
    closeVisit(st.visitRowId);
  }

  private finishChat(st: SessionState): void {
    if (!st.chatRowId) return;
    closeChatSession(st.chatRowId);
  }
}
