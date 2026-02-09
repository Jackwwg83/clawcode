# Control UI

## Goal
Reuse OpenClaw UI and serve it from the Gateway.

## Reused Modules
- ui/
- src/gateway/control-ui.ts

## Notes
- Keep endpoints and websocket protocol unchanged.
- Update branding to ClawCode as needed.

## Architecture

### Overview
The Control UI is a web-based interface for managing ClawCode sessions, configuration, and monitoring. It provides real-time visibility into agent activities and allows users to interact with the system through a browser.

### Components

#### 1. Frontend (ui/)
- **Technology Stack**: React-based single-page application
- **Build Process**: Source files in `ui/src` are compiled to `dist/control-ui`
- **Serving**: Static files served by Gateway via control-ui.ts

#### 2. Backend Integration (src/gateway/control-ui.ts)
- **HTTP Endpoints**: RESTful API for configuration and session management
- **WebSocket Server**: Real-time bidirectional communication for live updates
- **Gateway Integration**: Control UI is mounted as a sub-router in the Gateway

### Key Features

#### Session Management
- **View Active Sessions**: List all running agent sessions with status
- **Session Details**: Inspect conversation history, memory state, and metrics
- **Session Control**: Start, stop, pause, or resume sessions
- **Multi-Session View**: Switch between different agent contexts

#### Configuration Editor
- **Config File Editing**: Web-based editor for `~/.clawcode/config.yaml`
- **Validation**: Real-time validation of configuration syntax
- **Hot Reload**: Apply configuration changes without restarting
- **Templates**: Pre-built configuration templates for common use cases

#### Status Dashboard
- **System Health**: Monitor Gateway, agent runtime, and channel status
- **Performance Metrics**: CPU, memory, message throughput
- **Error Logs**: Real-time error monitoring and alerts
- **Connection Status**: Track active channels and their states

#### Canvas System
- **Live Rendering**: Real-time visualization of agent activities
- **Message Flow**: Visual representation of message routing
- **Agent State**: Display current agent context and thinking
- **Interactive Elements**: Click to drill down into specific sessions or messages

### Communication Protocol

#### HTTP Endpoints
```
GET  /api/sessions              - List all sessions
GET  /api/sessions/:id          - Get session details
POST /api/sessions              - Create new session
PUT  /api/sessions/:id          - Update session
DELETE /api/sessions/:id        - Delete session

GET  /api/config                - Get current configuration
PUT  /api/config                - Update configuration

GET  /api/status                - Get system status
GET  /api/metrics               - Get performance metrics
```

#### WebSocket Protocol
- **Connection**: `ws://gateway-host/ws`
- **Message Format**: JSON-based protocol
- **Event Types**:
  - `session.update`: Session state changes
  - `message.new`: New message in session
  - `agent.thinking`: Agent reasoning updates
  - `system.status`: System health updates
  - `config.changed`: Configuration modifications

**Example WebSocket Message**:
```json
{
  "type": "session.update",
  "sessionId": "sess_123",
  "timestamp": "2026-02-09T10:30:00Z",
  "data": {
    "status": "active",
    "messageCount": 42,
    "lastActivity": "2026-02-09T10:29:55Z"
  }
}
```

### Build and Deployment

#### Development Build
```bash
cd ui
npm install
npm run dev      # Hot-reload development server
```

#### Production Build
```bash
cd ui
npm run build    # Compiles to dist/control-ui
```

#### Serving in Production
- Gateway automatically serves static files from `dist/control-ui`
- Control UI accessible at `http://gateway-host/ui`
- WebSocket connection established automatically on page load

### Security Considerations

#### Authentication
- **Token-Based Auth**: JWT tokens for API access
- **Session Validation**: Validate user permissions for session operations
- **Origin Checking**: CORS configuration for WebSocket connections

#### Authorization
- **Role-Based Access**: Admin, user, and viewer roles
- **Session Isolation**: Users can only access their own sessions (unless admin)
- **Config Protection**: Sensitive config values masked in UI

### State Management

#### Frontend State
- **Local State**: React hooks for component-level state
- **Global State**: Context API for session and config state
- **WebSocket State**: Real-time updates synchronized with backend
- **Persistence**: LocalStorage for UI preferences

#### Backend State
- **In-Memory Cache**: Recent session data for quick access
- **Database Sync**: Periodic sync with persistent storage
- **Event Broadcasting**: State changes broadcast to all connected clients

### Error Handling

#### Frontend
- **Connection Loss**: Auto-reconnect for WebSocket with exponential backoff
- **API Errors**: User-friendly error messages with retry options
- **Validation Errors**: Inline validation feedback in forms

#### Backend
- **Graceful Degradation**: UI remains functional if WebSocket fails
- **Rate Limiting**: Prevent API abuse with request throttling
- **Error Logging**: Comprehensive error tracking and reporting

### Branding Updates
- Replace OpenClaw references with ClawCode
- Update logo and color scheme as needed
- Maintain consistent branding across all UI elements
- Keep OpenClaw attribution where appropriate (license compliance)

### Future Enhancements
- **Plugin System**: Allow custom UI plugins for extended functionality
- **Theming**: Support for dark/light themes and custom themes
- **Mobile Support**: Responsive design for mobile devices
- **Collaborative Features**: Multi-user session viewing and annotation
