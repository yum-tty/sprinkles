# Sprinkles

<p>
    <a href="https://github.com/charmbracelet/log"><img src="https://img.shields.io/badge/original-log-blue" alt="Original Log"></a>
    <a href="https://github.com/yum-tty/sprinkles"><img src="https://img.shields.io/badge/port--sprinkles-green" alt="Sprinkles Port"></a>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-bun-black" alt="Bun Runtime"></a>
</p>

A logging library for Bun. A TypeScript port of [Log](https://github.com/charmbracelet/log).

Sprinkles provides a simple, structured logging API with support for multiple output formats and log levels.

## Installation

```bash
bun add github:yum-tty/sprinkles
```

Or install from a specific package:

```bash
bun add @yum-tty/sprinkles
```

## Quick Start

```typescript
import { Logger, Info, Debug, Error } from "sprinkles"

// Use the default logger
Info("Server started", "port", 3000)
Debug("Connection established")
Error("Failed to connect", "host", "localhost")
```

## Features

### Log Levels

```typescript
import { Trace, Debug, Info, Warn, Error, Fatal } from "sprinkles"

Trace("Trace message")
Debug("Debug message")
Info("Info message")
Warn("Warning message")
Error("Error message")
// Fatal("Fatal message") // Exits the process
```

### Custom Logger

```typescript
import { Logger, InfoLevel } from "sprinkles"

const logger = new Logger({
  level: InfoLevel,    // Info level
  prefix: "myapp",     // Add prefix to all messages
  timestamp: true,     // Show timestamps
})

logger.info("Server started", "port", 3000)
logger.debug("Debug message")  // Won't show (level too low)
logger.error("Error occurred")
```

### Output Formats

```typescript
import { Logger, TextFormatter, JSONFormatter, LogfmtFormatter } from "sprinkles"

// Text format (default)
const textLogger = new Logger({ formatter: TextFormatter })

// JSON format
const jsonLogger = new Logger({ formatter: JSONFormatter })

// Logfmt format
const logfmtLogger = new Logger({ formatter: LogfmtFormatter })
```

### Key-Value Pairs

```typescript
import { Info, Debug, Error } from "sprinkles"

Info("User logged in", "userId", 123, "ip", "192.168.1.1")
Debug("Processing request", "method", "GET", "path", "/api/users")
Error("Database error", "query", "SELECT *", "error", "timeout")
```

### Log Levels

| Level | Name | Description |
|-------|------|-------------|
| -2 | TRACE | Trace messages |
| -1 | DEBUG | Debug messages |
| 0 | INFO | Informational messages |
| 1 | WARN | Warning messages |
| 2 | ERROR | Error messages |
| 3 | FATAL | Fatal messages (exits process) |

### Setting Level

```typescript
import { Logger, DebugLevel, InfoLevel } from "sprinkles"

// Show only info and above
const logger = new Logger({ level: InfoLevel })

// Show debug and above
const debugLogger = new Logger({ level: DebugLevel })
```

## API Reference

### Logger

| Method | Description |
|--------|-------------|
| `trace(msg, ...keyvals)` | Log a trace message |
| `debug(msg, ...keyvals)` | Log a debug message |
| `info(msg, ...keyvals)` | Log an info message |
| `warn(msg, ...keyvals)` | Log a warning message |
| `error(msg, ...keyvals)` | Log an error message |
| `fatal(msg, ...keyvals)` | Log a fatal message and exit |

### Config Options

| Option | Description |
|--------|-------------|
| `level` | Set the log level |
| `prefix` | Set a prefix for all messages |
| `timestamp` | Enable/disable timestamps |
| `caller` | Enable/disable caller info |
| `formatter` | Set output format |

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) first.

## License

[MIT](./LICENSE)

---

Based on [Log](https://github.com/charmbracelet/log) by [Charm](https://charm.sh).
