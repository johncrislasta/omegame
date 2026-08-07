import {
  createVisit,
  closeVisit,
  updateVisitCountry,
  createChatSession,
  closeChatSession,
  updateChatSession,
} from "./analytics";

export class SocketTracker {
  private sessions = new Map<string, Set<string>>();
  private visitRows = new Map<string, string>();
  private chatRows = new Map<string, string>();

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
    let set = this.sessions.get(sessionId);
    if (!set) {
      set = new Set();
      this.sessions.set(sessionId, set);
      if (persist) {
        createVisit(sessionId, page || "unknown", country, ip, device, os, browser, source, medium, campaign).then((rowId) => {
          if (rowId && this.sessions.has(sessionId)) {
            this.visitRows.set(sessionId, rowId);
          }
        });
      }
    }
    set.add(socketId);
    return sessionId;
  }

  onSetCountry(sessionId: string, country: string): void {
    const rowId = this.visitRows.get(sessionId);
    if (rowId) updateVisitCountry(rowId, country);
  }

  onFindStranger(sessionId: string, mode: string, country?: string, ip?: string, device?: string, os?: string, browser?: string, source?: string, medium?: string, campaign?: string): void {
    const existing = this.chatRows.get(sessionId);
    if (existing) {
      updateChatSession(existing, mode, country);
      return;
    }
    createChatSession(sessionId, mode, country, ip, device, os, browser, source, medium, campaign).then((rowId) => {
      if (rowId && this.sessions.has(sessionId)) {
        this.chatRows.set(sessionId, rowId);
      }
    });
  }

  onDisconnect(socketId: string, sessionId: string): void {
    const set = this.sessions.get(sessionId);
    if (!set) return;
    set.delete(socketId);
    if (set.size > 0) return;
    this.sessions.delete(sessionId);
    const visitId = this.visitRows.get(sessionId);
    if (visitId) {
      this.visitRows.delete(sessionId);
      closeVisit(visitId);
    }
    const chatId = this.chatRows.get(sessionId);
    if (chatId) {
      this.chatRows.delete(sessionId);
      closeChatSession(chatId);
    }
  }
}
