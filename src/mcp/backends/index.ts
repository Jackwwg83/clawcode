/**
 * MCP Backend Adapters
 *
 * Adapts OpenClaw services to MCP server backend interfaces.
 */
export { createMemoryBackend, type MemoryBackendDeps } from "./memory-backend.js";
export { createSessionsBackend, type SessionsBackendDeps } from "./sessions-backend.js";
export { createMessageBackend, type MessageBackendDeps } from "./message-backend.js";

// Real service wiring
export {
  createRealMemoryBackend,
  createRealSessionsBackend,
  createRealMessageBackend,
} from "./real-services.js";
