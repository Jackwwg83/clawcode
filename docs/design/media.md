# Media

## Goal
Reuse OpenClaw media pipeline for images/audio/video.

## Reused Modules
- src/media/*
- src/media-understanding/* (if still used by tools)

## Notes
- Keep size caps, temp file lifecycle, and transcription hooks.
- Integrate with AgentBridge for attachments.

## Architecture

### Overview
The Media system handles all non-text content flowing through ClawCode, including images, audio, video, and documents. It provides upload processing, format validation, storage management, and delivery to agents via the Claude Agent SDK.

### Media Types Supported

#### Images
- **Formats**: JPEG, PNG, GIF, WebP, BMP, SVG
- **Use Cases**: Visual analysis, OCR, image description, diagram understanding
- **Processing**: Automatic format conversion, thumbnail generation

#### Audio
- **Formats**: MP3, WAV, OGG, FLAC, M4A
- **Use Cases**: Voice messages, audio transcription, speech analysis
- **Processing**: Transcription via Whisper API or local models

#### Video
- **Formats**: MP4, WebM, AVI, MOV
- **Use Cases**: Video analysis, frame extraction, content understanding
- **Processing**: Frame sampling, audio extraction, metadata parsing

#### Documents
- **Formats**: PDF, DOCX, TXT, MD, RTF
- **Use Cases**: Document analysis, text extraction, structured data parsing
- **Processing**: Text extraction, layout preservation

### Upload Flow

#### 1. Attachment Parsing
```
Channel Message → Gateway → Attachment Parser → Media Processor
```

**Parser Responsibilities**:
- Detect attachment type from MIME type and extension
- Extract metadata (filename, size, dimensions)
- Generate unique media ID for tracking
- Validate attachment structure

#### 2. Size Limits
```yaml
# Default size limits (configurable per channel)
image_max_size: 10MB
audio_max_size: 25MB
video_max_size: 100MB
document_max_size: 20MB
```

**Enforcement**:
- Pre-upload validation where possible (API checks)
- Post-download validation for URL attachments
- Graceful rejection with user-friendly error messages
- Size limit overrides per channel in config

#### 3. Format Validation

**Image Validation**:
- Magic number check for format verification
- Dimension limits (max 4096x4096 pixels)
- Color depth and compression validation
- Reject corrupted or malformed images

**Audio Validation**:
- Codec verification (supported codecs only)
- Duration limits (max 60 minutes)
- Sample rate and bitrate checks
- Audio channel validation (mono/stereo)

**Video Validation**:
- Container and codec compatibility
- Resolution limits (max 1920x1080)
- Duration limits (max 30 minutes)
- Frame rate validation

**Document Validation**:
- Format structure verification
- Page count limits (max 100 pages for PDFs)
- Embedded content scanning
- Text extraction feasibility check

### Storage System

#### Temporary File Storage
```
/tmp/clawcode/media/
├── images/
│   └── [session_id]/
│       └── [media_id].[ext]
├── audio/
│   └── [session_id]/
│       └── [media_id].[ext]
├── video/
│   └── [session_id]/
│       └── [media_id].[ext]
└── documents/
    └── [session_id]/
        └── [media_id].[ext]
```

**Storage Characteristics**:
- Session-scoped directories for isolation
- Automatic directory creation on first use
- Atomic write operations to prevent corruption
- Symlink protection for security

#### Cleanup Policy

**Immediate Cleanup**:
- Failed uploads or validation errors
- Duplicate media (checksum-based deduplication)
- Temporary processing artifacts

**Session Cleanup**:
- On session end: delete all media in session directory
- Grace period: 1 hour after session end (configurable)
- Orphan detection: cleanup media without active sessions

**Scheduled Cleanup**:
- Daily scan for expired temporary files
- Remove files older than retention period (default: 24 hours)
- Log cleanup activities for auditing

### Delivery to Agents

#### Base64 Encoding
- **For Images**: Inline base64 in message content (small images only)
- **Size Threshold**: < 1MB for base64, larger use file references
- **Format**: `data:[mime-type];base64,[encoded-data]`
- **Use Case**: Immediate display in UI, quick agent access

#### URL References
- **Local URLs**: `file:///tmp/clawcode/media/[session]/[media_id].[ext]`
- **Temporary URLs**: Signed URLs with expiration (1 hour default)
- **External URLs**: Preserved if originally provided via URL
- **Use Case**: Large files, efficient agent access

#### Claude Agent SDK Integration
```javascript
// Media delivered as attachment in agent context
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/jpeg",
    data: "base64-encoded-data"
  }
}

// Or as file reference
{
  type: "image",
  source: {
    type: "url",
    url: "file:///tmp/clawcode/media/sess_123/img_456.jpg"
  }
}
```

### Channel-Specific Constraints

#### Discord
- **Image**: 8MB limit
- **Audio**: 8MB limit
- **Video**: 8MB limit (or 50MB with Nitro)
- **Documents**: 8MB limit

#### Slack
- **Image**: 1GB limit (but 10MB recommended)
- **Audio**: 1GB limit
- **Video**: 1GB limit
- **Documents**: 1GB limit

#### Telegram
- **Image**: 10MB limit
- **Audio**: 50MB limit
- **Video**: 50MB limit
- **Documents**: 2GB limit

#### WhatsApp
- **Image**: 16MB limit
- **Audio**: 16MB limit
- **Video**: 16MB limit
- **Documents**: 100MB limit

**Implementation**:
- Channel-specific validators in `src/media/validators/`
- Configurable limits in channel config
- Automatic downsampling/compression if channel supports it

### Media Directives

#### MEDIA: Directive
**Purpose**: Explicitly mark media content in agent output

**Syntax**:
```
MEDIA:image:base64:[base64-data]
MEDIA:image:url:https://example.com/image.jpg
MEDIA:audio:file:/tmp/audio.mp3
MEDIA:video:url:https://example.com/video.mp4
```

**Processing**:
- Gateway parses MEDIA: directives from agent output
- Fetches/decodes media content
- Attaches to outgoing channel message
- Removes directive from text content

**Error Handling**:
- Invalid URLs: log error, include text placeholder
- Failed fetches: retry with exponential backoff
- Unsupported formats: convert or reject with message

#### [[audio_as_voice]] Directive
**Purpose**: Request audio be sent as voice message (channel-dependent)

**Syntax**:
```
[[audio_as_voice]]
MEDIA:audio:file:/tmp/speech.mp3
```

**Channel Support**:
- **Telegram**: Sends as voice message (waveform visualization)
- **WhatsApp**: Sends as voice note
- **Discord**: Sends as regular audio attachment (no special handling)
- **Slack**: Sends as audio file

**Implementation**:
- Detected during message processing
- Channel adapter applies appropriate API call
- Fallback to regular audio if not supported

### Media Understanding

#### Image Analysis (src/media-understanding/)
- **Vision Models**: Claude 3 Opus/Sonnet for image understanding
- **OCR**: Extract text from images
- **Object Detection**: Identify objects and scenes
- **Diagram Parsing**: Understand charts, graphs, diagrams

#### Audio Transcription
- **Whisper API**: Cloud-based transcription (OpenAI)
- **Local Whisper**: Self-hosted transcription model
- **Language Detection**: Automatic language identification
- **Timestamp Alignment**: Word-level timestamps

#### Video Processing
- **Frame Extraction**: Sample frames at intervals
- **Audio Track**: Extract and transcribe audio
- **Metadata**: Duration, resolution, codec info
- **Scene Detection**: Identify scene changes

### Error Handling

#### Upload Errors
- **Network Failures**: Retry with exponential backoff (max 3 attempts)
- **Timeout**: 30-second timeout per upload
- **Size Exceeded**: Clear error message with size limit
- **Format Unsupported**: Suggest supported formats

#### Processing Errors
- **Validation Failures**: Detailed error messages
- **Transcription Errors**: Fallback to raw audio delivery
- **Conversion Errors**: Attempt alternative converters
- **Storage Errors**: Check disk space, permissions

#### Delivery Errors
- **Channel Limits**: Auto-compress or split if possible
- **Network Issues**: Queue for retry
- **Format Incompatibility**: Convert to channel-supported format

### Performance Optimization

#### Caching
- **Thumbnail Cache**: Pre-generated thumbnails for images
- **Transcription Cache**: Cache transcripts by audio checksum
- **Metadata Cache**: Cache extracted metadata

#### Lazy Loading
- **On-Demand Processing**: Only process media when accessed
- **Background Processing**: Queue non-critical processing
- **Parallel Processing**: Multiple media items in parallel

#### Resource Management
- **Connection Pooling**: Reuse HTTP connections for downloads
- **Stream Processing**: Stream large files to avoid memory issues
- **Cleanup Scheduling**: Off-peak cleanup operations

### Security Considerations

#### Input Validation
- **Magic Number Check**: Verify actual file type vs. claimed type
- **Size Limits**: Enforce strict size limits
- **Content Scanning**: Scan for malicious content
- **Path Traversal**: Prevent directory traversal attacks

#### Storage Security
- **Isolated Directories**: Session-scoped isolation
- **Permission Restrictions**: Minimal file permissions
- **Encrypted Storage**: Optional encryption at rest
- **Secure Deletion**: Overwrite files on deletion

#### Privacy
- **Temporary Storage**: No long-term media retention
- **No External Sharing**: Media never shared outside session
- **Audit Logging**: Log all media access
- **PII Detection**: Warn on potential PII in media

### Integration Points

#### AgentBridge
- **Attachment Parsing**: Bridge parses attachments from channel messages
- **Format Conversion**: Bridge converts to agent-compatible format
- **Metadata Passing**: Bridge passes media metadata to agent context

#### Gateway
- **Media Router**: Routes media requests to appropriate handlers
- **Storage Manager**: Manages temporary file lifecycle
- **Cleanup Scheduler**: Triggers scheduled cleanup tasks

#### Channel Adapters
- **Download**: Fetch media from channel APIs
- **Upload**: Send media to channel APIs
- **Format Adaptation**: Convert to channel-specific formats

### Monitoring and Logging

#### Metrics
- **Upload/Download Rates**: Track throughput
- **Processing Times**: Monitor performance bottlenecks
- **Storage Usage**: Track disk usage
- **Error Rates**: Monitor failure rates

#### Logging
- **Media Events**: Log all media operations
- **Error Details**: Comprehensive error logging
- **Performance**: Log slow operations
- **Security Events**: Log validation failures, suspicious activity

### Future Enhancements
- **Advanced Compression**: Smart compression based on content type
- **Media Streaming**: Stream large video files instead of full download
- **Multi-Format Output**: Generate multiple formats for compatibility
- **Content Moderation**: Automatic content filtering
- **Rich Previews**: Generate rich previews for all media types
