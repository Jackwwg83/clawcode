/**
 * Sessions Backend Adapter
 *
 * Adapts gateway session APIs to SessionsBackend interface for MCP sessions server.
 */
import type { SessionsBackend, SessionInfo, SessionMessage, SendResult } from "../sessions-server.js";

export type SessionsBackendDeps = {
  listSessions(): Promise<SessionInfo[]>;
  getSessionHistory(sessionKey: string, options: { limit: number }): Promise<SessionMessage[]>;
  sendToSession(sessionKey: string, message: string): Promise<SendResult>;
};

/**
 * Create sessions backend adapter
 */
export function createSessionsBackend(deps: SessionsBackendDeps): SessionsBackend {
  return {
    async list(): Promise<SessionInfo[]> {
      return deps.listSessions();
    },

    async history(sessionKey: string, options: { limit: number }): Promise<SessionMessage[]> {
      return deps.getSessionHistory(sessionKey, options);
    },

    async send(sessionKey: string, message: string): Promise<SendResult> {
      return deps.sendToSession(sessionKey, message);
    },
  };
}
