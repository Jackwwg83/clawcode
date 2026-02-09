# Memory

## Goal
Reuse OpenClaw memory system with vector + FTS search.

## Reused Modules
- src/memory/*

## Behavior
- Keep embeddings providers (OpenAI, Gemini, local) unchanged.
- Preserve memory file sync + session transcript indexing.
- Expose memory via MCP server for recall/remember/forget.

## Architecture

### Overview
The Memory system provides persistent knowledge storage and retrieval for ClawCode agents. It combines vector embeddings for semantic search with full-text search (FTS) for precise keyword matching. Memory is exposed to agents via MCP (Model Context Protocol) tools and maintained in both database and file formats.

### Core Components

#### 1. Vector Database
- **Technology**: OpenClaw memory index (vector store implementation)
- **Purpose**: Semantic similarity search across memories
- **Data Structure**: High-dimensional embeddings of memory content
- **Indexing**: Automatic embedding generation on memory write

#### 2. Full-Text Search (FTS)
- **Technology**: SQLite FTS5 or similar
- **Purpose**: Exact keyword and phrase matching
- **Data Structure**: Inverted index of tokenized memory text
- **Indexing**: Synchronized with vector database updates

#### 3. MCP Memory Server
- **Interface**: Exposes memory operations as MCP tools
- **Tools**: `recall`, `remember`, `forget`
- **Integration**: Seamlessly available to Claude Agent SDK
- **Protocol**: Standard MCP request/response format

#### 4. File-Based Memory
- **Location**: `~/.clawcode/memory/`
- **Format**: Markdown or YAML files
- **Purpose**: Human-editable memory entries
- **Sync**: Bidirectional sync between files and database

### Memory Operations

#### Remember (Write)
**Purpose**: Store new memories or update existing ones

**MCP Tool Interface**:
```json
{
  "tool": "remember",
  "arguments": {
    "content": "User prefers Python for scripting tasks",
    "tags": ["preferences", "programming"],
    "context": {
      "session_id": "sess_123",
      "timestamp": "2026-02-09T10:30:00Z"
    }
  }
}
```

**Processing Flow**:
1. Validate content (not empty, reasonable length)
2. Generate embedding via configured provider
3. Extract keywords for FTS indexing
4. Store in vector database with metadata
5. Update FTS index
6. Write to corresponding file in `~/.clawcode/memory/`
7. Return memory ID to agent

**File Format** (`~/.clawcode/memory/preferences.md`):
```markdown
# Preferences

## Programming Languages
- User prefers Python for scripting tasks (2026-02-09)
- User likes TypeScript for web development (2026-02-07)

## Communication Style
- User prefers concise responses (2026-02-08)
```

#### Recall (Read)
**Purpose**: Retrieve relevant memories based on query

**MCP Tool Interface**:
```json
{
  "tool": "recall",
  "arguments": {
    "query": "What programming languages does the user prefer?",
    "limit": 5,
    "min_relevance": 0.7,
    "filters": {
      "tags": ["preferences", "programming"],
      "session_id": "sess_123"
    }
  }
}
```

**Search Strategy**:
1. **Hybrid Search**: Combine vector similarity and FTS scores
   - Vector search: Semantic similarity using embeddings
   - FTS search: Keyword/phrase matching
   - Score fusion: Weighted combination (70% vector, 30% FTS)

2. **Ranking**: Sort by combined relevance score
3. **Filtering**: Apply tag and context filters
4. **Thresholding**: Return only results above `min_relevance`

**Response Format**:
```json
{
  "results": [
    {
      "memory_id": "mem_456",
      "content": "User prefers Python for scripting tasks",
      "relevance": 0.92,
      "tags": ["preferences", "programming"],
      "timestamp": "2026-02-09T10:30:00Z",
      "context": {
        "session_id": "sess_123"
      }
    }
  ]
}
```

#### Forget (Delete)
**Purpose**: Remove memories from the system

**MCP Tool Interface**:
```json
{
  "tool": "forget",
  "arguments": {
    "memory_id": "mem_456",
    "reason": "Outdated preference"
  }
}
```

**Processing Flow**:
1. Validate memory_id exists
2. Remove from vector database
3. Remove from FTS index
4. Update or remove file entry
5. Log deletion for audit trail
6. Return confirmation

**Selective Forgetting**:
- By memory ID: Delete specific memory
- By query: Delete all matching memories
- By age: Delete memories older than threshold
- By tag: Delete all memories with specific tag

### Embedding Providers

#### OpenAI Embeddings
- **Model**: text-embedding-3-small or text-embedding-3-large
- **Dimensions**: 1536 (small) or 3072 (large)
- **Cost**: Per-token pricing
- **Use Case**: High-quality embeddings, cloud-based

**Configuration**:
```yaml
memory:
  embedding_provider: openai
  openai:
    model: text-embedding-3-small
    api_key: ${OPENAI_API_KEY}
```

#### Gemini Embeddings
- **Model**: text-embedding-004
- **Dimensions**: 768
- **Cost**: Free tier available
- **Use Case**: Google ecosystem integration

**Configuration**:
```yaml
memory:
  embedding_provider: gemini
  gemini:
    model: text-embedding-004
    api_key: ${GEMINI_API_KEY}
```

#### Local Embeddings
- **Model**: sentence-transformers (all-MiniLM-L6-v2 or similar)
- **Dimensions**: 384-768 (model-dependent)
- **Cost**: Free (self-hosted)
- **Use Case**: Privacy-sensitive deployments, offline operation

**Configuration**:
```yaml
memory:
  embedding_provider: local
  local:
    model_path: ./models/all-MiniLM-L6-v2
    device: cpu  # or 'cuda' for GPU
```

### Memory Contexts

#### Per-Agent Context
- **Scope**: Each agent has isolated memory space
- **Implementation**: Agent ID as partition key in database
- **Use Case**: Prevent memory leakage between agents

#### Per-Session Context
- **Scope**: Memories tagged with session ID
- **Implementation**: Session metadata in memory entries
- **Use Case**: Session-specific context and history

#### Global Context
- **Scope**: Shared memories across all agents/sessions
- **Implementation**: No agent or session filter
- **Use Case**: Common knowledge, system-wide facts

**Context Hierarchy**:
```
Global Memory (all agents can access)
  └─ Agent Memory (specific agent only)
      └─ Session Memory (specific session only)
```

**Query Resolution**:
1. Search session-specific memories first
2. Expand to agent-level memories
3. Include global memories
4. Merge and rank results

### File-Based Memory Sync

#### Directory Structure
```
~/.clawcode/memory/
├── global/              # Global memories
│   ├── facts.md
│   └── preferences.md
├── agents/              # Agent-specific memories
│   └── [agent_id]/
│       ├── learnings.md
│       └── context.md
└── sessions/            # Session-specific memories
    └── [session_id]/
        └── notes.md
```

#### Sync Mechanism

**File → Database (Import)**:
- **Trigger**: File modification detected (file watcher)
- **Processing**: Parse file, extract memories, update database
- **Conflict**: Database takes precedence for conflicts
- **Frequency**: Real-time on file change

**Database → File (Export)**:
- **Trigger**: Memory write operation
- **Processing**: Format memory as markdown, append to file
- **Grouping**: Group by tags for file organization
- **Frequency**: Immediate on memory write

#### File Format Specification

**Markdown Format**:
```markdown
# Category Title

## Subcategory (optional)

- Memory content here (timestamp)
  - metadata: value
  - tags: tag1, tag2

- Another memory (timestamp)
```

**YAML Format**:
```yaml
memories:
  - id: mem_456
    content: "User prefers Python for scripting tasks"
    tags: [preferences, programming]
    timestamp: "2026-02-09T10:30:00Z"
    context:
      session_id: sess_123
```

**User Editing**:
- Users can directly edit memory files
- Changes automatically synced to database
- Invalid entries logged but not imported
- Schema validation on sync

### Session Transcript Indexing

#### Automatic Indexing
**Trigger**: End of each turn in conversation

**Indexing Process**:
1. Extract key information from turn:
   - User intent and questions
   - Agent responses and conclusions
   - Important facts mentioned
   - Decisions made

2. Generate memory entries:
   - Summarize turn content
   - Extract entities and relationships
   - Tag with session and timestamp

3. Store in memory system:
   - Write to vector database
   - Update FTS index
   - Append to session transcript file

**Selective Indexing**:
- Skip trivial exchanges (greetings, acknowledgments)
- Focus on substantive content
- Configurable importance threshold

#### Transcript Files
**Location**: `~/.clawcode/transcripts/[session_id].md`

**Format**:
```markdown
# Session Transcript: sess_123
Started: 2026-02-09T10:00:00Z

## Turn 1 (10:00:05)
**User**: What programming languages should I use for my project?

**Agent**: Based on your requirements, I recommend:
- Python for backend services (rapid development)
- TypeScript for frontend (type safety)

[Indexed: Programming language recommendations]

## Turn 2 (10:01:23)
**User**: I prefer Python for everything.

**Agent**: Understood. I'll remember your Python preference.

[Indexed: User preference for Python]
```

### Integration with Claude Agent SDK

#### MCP Server Configuration
**Location**: `~/.clawcode/mcp-servers.json`

```json
{
  "memory": {
    "command": "clawcode-memory-server",
    "args": ["--config", "~/.clawcode/config.yaml"],
    "env": {
      "MEMORY_DB_PATH": "~/.clawcode/memory/db"
    }
  }
}
```

#### Tool Availability
**Automatic Registration**: Claude Agent SDK automatically discovers memory tools

**Agent Usage**:
```javascript
// Agent can use memory tools naturally
const memories = await agent.useTool('recall', {
  query: 'user preferences',
  limit: 5
});

await agent.useTool('remember', {
  content: 'User prefers detailed explanations',
  tags: ['communication', 'preferences']
});
```

**Tool Descriptions** (MCP):
```json
{
  "tools": [
    {
      "name": "recall",
      "description": "Search memory for relevant information",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {"type": "string"},
          "limit": {"type": "integer"},
          "min_relevance": {"type": "number"}
        },
        "required": ["query"]
      }
    },
    {
      "name": "remember",
      "description": "Store information in memory",
      "inputSchema": {
        "type": "object",
        "properties": {
          "content": {"type": "string"},
          "tags": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["content"]
      }
    },
    {
      "name": "forget",
      "description": "Remove information from memory",
      "inputSchema": {
        "type": "object",
        "properties": {
          "memory_id": {"type": "string"}
        },
        "required": ["memory_id"]
      }
    }
  ]
}
```

### Performance Optimization

#### Caching
- **Embedding Cache**: Cache embeddings for repeated queries
- **Search Result Cache**: Cache recent search results (5-minute TTL)
- **File Content Cache**: Cache file contents to reduce I/O

#### Indexing Strategies
- **Batch Indexing**: Batch memory writes for efficiency
- **Incremental Updates**: Update only changed entries
- **Background Indexing**: Index transcripts asynchronously

#### Database Optimization
- **Connection Pooling**: Reuse database connections
- **Index Tuning**: Optimize vector and FTS indices
- **Vacuum Schedule**: Regular database maintenance

### Privacy and Security

#### Data Protection
- **Local Storage**: All memory data stored locally
- **No Cloud Sync**: Memory never sent to cloud (unless embeddings)
- **Encryption at Rest**: Optional database encryption
- **Access Control**: Memory isolated per agent/session

#### Sensitive Data Handling
- **PII Detection**: Warn when storing potential PII
- **Redaction**: Optional automatic redaction of sensitive data
- **Audit Log**: Track all memory access and modifications
- **Retention Policy**: Configurable memory expiration

### Error Handling

#### Embedding Generation Failures
- **Retry Logic**: Exponential backoff for transient errors
- **Fallback**: Use FTS-only search if embeddings fail
- **Error Logging**: Log all embedding failures
- **Graceful Degradation**: Continue with reduced functionality

#### Database Errors
- **Connection Failures**: Auto-reconnect with connection pooling
- **Corruption Detection**: Validate database integrity on startup
- **Backup/Restore**: Automatic backups before risky operations
- **Transaction Rollback**: Rollback on write failures

#### Sync Conflicts
- **Conflict Resolution**: Database wins for conflicting updates
- **Merge Strategies**: Attempt smart merging where possible
- **User Notification**: Notify user of sync conflicts
- **Manual Resolution**: Provide tools for manual conflict resolution

### Monitoring and Observability

#### Metrics
- **Memory Count**: Total memories stored
- **Storage Size**: Disk usage by memory system
- **Query Latency**: Search performance metrics
- **Embedding Performance**: Embedding generation time

#### Logging
- **Memory Operations**: Log all remember/recall/forget
- **Search Queries**: Log queries and results
- **Sync Events**: Log file sync operations
- **Errors**: Comprehensive error logging

### Configuration

#### Example Configuration
```yaml
memory:
  # Embedding provider
  embedding_provider: openai  # openai, gemini, or local

  # Database settings
  database:
    path: ~/.clawcode/memory/db
    backup_enabled: true
    backup_interval: 24h

  # Search settings
  search:
    vector_weight: 0.7
    fts_weight: 0.3
    min_relevance: 0.6
    max_results: 20

  # File sync settings
  file_sync:
    enabled: true
    directory: ~/.clawcode/memory
    format: markdown  # markdown or yaml
    watch_interval: 5s

  # Transcript indexing
  transcript:
    enabled: true
    auto_index: true
    importance_threshold: 0.5

  # Retention policy
  retention:
    session_memories: 30d
    agent_memories: 90d
    global_memories: unlimited
```

### Future Enhancements
- **Graph Memory**: Relationships between memories
- **Temporal Queries**: Search by time range
- **Multi-Modal Memory**: Store and search images, audio
- **Collaborative Memory**: Shared memory across multiple agents
- **Memory Compression**: Summarize old memories to save space
- **Memory Export**: Export memories to external formats
