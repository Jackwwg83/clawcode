/**
 * Message Backend Adapter
 *
 * Adapts gateway message delivery to MessageBackend interface for MCP message server.
 */
import type { MessageBackend, SendResult } from "../message-server.js";

export type MessageBackendDeps = {
  sendToChannel(channelId: string, target: string, message: string): Promise<SendResult>;
};

/**
 * Create message backend adapter
 */
export function createMessageBackend(deps: MessageBackendDeps): MessageBackend {
  return {
    async send(channelId: string, target: string, message: string): Promise<SendResult> {
      return deps.sendToChannel(channelId, target, message);
    },
  };
}
