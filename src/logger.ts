import {
  Level,
  DebugLevel,
  InfoLevel,
  WarnLevel,
  ErrorLevel,
  FatalLevel,
  NoLevel,
  LevelName,
} from "./level"
import {
  Styles,
  DefaultStyles,
  cloneStyles,
} from "./styles"
import { ThemeConfig, applyTheme, getPreset } from "./themes"
import { textFormat } from "./text"
import { jsonFormat } from "./json"
import { logfmtFormat } from "./logfmt"
import { formatTime } from "./time"

const callerCache = new Map<string, string>()
const CALLER_CACHE_MAX = 1000

class Mutex {
  private _locked = false

  runExclusive<T>(fn: () => T): T {
    if (this._locked) {
      return fn()
    }
    this._locked = true
    try {
      return fn()
    } finally {
      this._locked = false
    }
  }
}

export interface SlogHandler {
  Enabled(level: Level): boolean
  Handle(record: { level: Level; message: string; time: Date; attrs: any[] }): void
  WithAttrs(attrs: any[]): SlogHandler
  WithGroup(name: string): SlogHandler
}

export type Formatter = number
export const TextFormatter: Formatter = 0
export const JSONFormatter: Formatter = 1
export const LogfmtFormatter: Formatter = 2

export const TimestampKey = "time"
export const MessageKey = "msg"
export const LevelKey = "level"
export const CallerKey = "caller"
export const PrefixKey = "prefix"
export const DefaultTimeFormat = "YYYY/MM/DD HH:mm:ss"

export const ErrMissingValue = "missing value"

export type CallerFormatter = (file: string, line: number, fn: string) => string

export const ShortCallerFormatter: CallerFormatter = (file, line) => {
  const parts = file.split("/")
  const short = parts.slice(-2).join("/")
  return `${short}:${line}`
}

export const LongCallerFormatter: CallerFormatter = (file, line) => `${file}:${line}`

export type TimeFunction = (t: Date) => Date

export const NowUTC: TimeFunction = (t) => {
  return new Date(t.toISOString())
}

export interface LoggerConfig {
  level?: Level
  prefix?: string
  timestamp?: boolean
  caller?: boolean
  formatter?: Formatter
  theme?: string | ThemeConfig
  timeFormat?: string
  separator?: string
  indent?: string
  multiline?: string
}

export const separator = "="
export const indentSeparator = "  │ "

/**
 * Formats a string using Go-style % verb formatting.
 * @param format - Format string with % verbs (e.g., %s, %d, %v, %f).
 * @param args - Values to substitute into the format string.
 * @returns The formatted string.
 */
export function sprintf(format: string, args: any[]): string {
  let argIdx = 0
  const parts: string[] = []
  for (let i = 0; i < format.length; i++) {
    if (format[i] === "%") {
      if (i + 1 >= format.length) {
        parts.push("%")
        break
      }
      if (format[i + 1] === "%") {
        parts.push("%")
        i++
        continue
      }
      let plusFlag = false
      let hashFlag = false
      let widthStr = ""
      let precStr = ""
      let pos = i + 1
      if (pos < format.length && format[pos] === "+") { plusFlag = true; pos++ }
      if (pos < format.length && format[pos] === "#") { hashFlag = true; pos++ }
      while (pos < format.length && format[pos] >= "0" && format[pos] <= "9") {
        widthStr += format[pos]; pos++
      }
      if (pos < format.length && format[pos] === ".") {
        pos++
        while (pos < format.length && format[pos] >= "0" && format[pos] <= "9") {
          precStr += format[pos]; pos++
        }
      }
      const verb = pos < format.length ? format[pos] : "%"
      i = pos
      const val = args[argIdx++]
      parts.push(formatVerb(verb, val, plusFlag, hashFlag, widthStr, precStr))
    } else {
      parts.push(format[i])
    }
  }
  return parts.join("")
}

function formatVerb(verb: string, val: any, plus: boolean, hash: boolean, width: string, prec: string): string {
  const w = width ? parseInt(width) : 0
  const p = prec !== "" ? parseInt(prec) : -1
  switch (verb) {
    case "s": return padLeft(String(val ?? ""), w)
    case "v": {
      if (val == null) return "<nil>"
      if (typeof val === "string") return val
      if (typeof val === "number" || typeof val === "boolean") return String(val)
      if (val instanceof Date) return val.toISOString()
      if (val instanceof Error) return val.message
      if (typeof val === "object" && typeof val.String === "function") return val.String()
      if (plus) {
        if (Array.isArray(val)) return "[" + val.map((v: any) => formatVerb("v", v, true, false, "", "")).join(" ") + "]"
        const keys = Object.keys(val)
        if (keys.length === 0) return "{}"
        return "{" + keys.map((k: string) => `${k}:${formatVerb("v", (val as any)[k], true, false, "", "")}`).join(" ") + "}"
      }
      return JSON.stringify(val)
    }
    case "+": {
      if (typeof val === "string") return val
      return String(val)
    }
    case "d": return padLeft(String(Math.trunc(Number(val) || 0)), w)
    case "f": {
      const n = Number(val) || 0
      const s = p >= 0 ? n.toFixed(p) : String(n)
      return padLeft(s, w)
    }
    case "x": {
      const n = typeof val === "number" ? val : 0
      const s = (hash ? "0x" : "") + Math.abs(n).toString(16)
      return padLeft(s, w)
    }
    case "X": {
      const n = typeof val === "number" ? val : 0
      const s = (hash ? "0X" : "") + Math.abs(n).toString(16).toUpperCase()
      return padLeft(s, w)
    }
    case "b": return padLeft((Number(val) || 0).toString(2), w)
    case "o": return padLeft((Number(val) || 0).toString(8), w)
    case "t": return val ? "true" : "false"
    case "T": return typeof val
    case "q": return JSON.stringify(String(val ?? ""))
    default: return "%" + verb
  }
}

function padLeft(s: string, width: number): string {
  if (width <= 0) return s
  return s.length < width ? " ".repeat(width - s.length) + s : s
}

/**
 * Checks whether a string needs quoting for safe logfmt output.
 * @param s - The string to check.
 * @returns True if the string contains characters that require quoting.
 */
export function needsQuoting(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0x22 || c === 0x3d) return true
    if (c < 0x20 || c === 0x7f) return true
    if (c === 0x20 || c === 0x85 || c === 0xa0) return true
    if (c >= 0xd800 && c <= 0xdfff) return true
  }
  return false
}

function isPrintable(r: number): boolean {
  if (r >= 0x20 && r < 0x7f) return true
  if (r >= 0xa0) return true
  return false
}

/**
 * Escapes non-printable and special characters in a string for log output.
 * @param str - The string to escape.
 * @param escapeQuotes - Whether to escape double-quote characters.
 * @returns The escaped string.
 */
export function escapeStringForOutput(str: string, escapeQuotes: boolean): string {
  let needsEscape = false
  for (let i = 0; i < str.length; i++) {
    const r = str.charCodeAt(i)
    if (r === 0x22 && escapeQuotes) { needsEscape = true; break }
    if (!isPrintable(r)) { needsEscape = true; break }
  }
  if (!needsEscape) return str

  const parts: string[] = []
  for (let i = 0; i < str.length; i++) {
    const r = str.charCodeAt(i)
    if (escapeQuotes && r === 0x22) {
      parts.push('\\"')
    } else if (isPrintable(r)) {
      parts.push(str[i])
    } else {
      switch (r) {
        case 0x07: parts.push("\\a"); break
        case 0x08: parts.push("\\b"); break
        case 0x0c: parts.push("\\f"); break
        case 0x0a: parts.push("\\n"); break
        case 0x0d: parts.push("\\r"); break
        case 0x09: parts.push("\\t"); break
        case 0x0b: parts.push("\\v"); break
        default:
          if (r < 0x20) {
            parts.push(`\\x${r.toString(16).padStart(2, "0")}`)
          } else {
            parts.push(`\\u${r.toString(16).padStart(4, "0")}`)
          }
      }
    }
  }
  return parts.join("")
}

export interface StandardLogOptions {
  ForceLevel?: Level
}

export interface StandardLogLogger {
  write(p: string): number
  output(calldepth: number, s: string): void
  print(...args: any[]): void
  printf(format: string, ...args: any[]): void
  println(...args: any[]): void
  panic(...args: any[]): void
  panicf(format: string, ...args: any[]): void
  panicln(...args: any[]): void
  fatal(...args: any[]): void
  fatalf(format: string, ...args: any[]): void
  fatalln(...args: any[]): void
  flags(): number
  setFlags(flag: number): void
  prefix(): string
  setPrefix(prefix: string): void
  writer(): { write(data: string): number }
  setOutput(w: any): void
  log(...args: any[]): void
}

export interface Options {
  TimeFunction?: TimeFunction
  TimeFormat?: string
  Level?: Level
  Prefix?: string
  ReportTimestamp?: boolean
  ReportCaller?: boolean
  CallerFormatter?: CallerFormatter
  CallerOffset?: number
  Fields?: any[]
  Formatter?: Formatter
  Separator?: string
  Indent?: string
  Multiline?: string
}

export class Logger {
  level: Level = InfoLevel
  prefix: string = ""
  reportTimestamp: boolean = true
  reportCaller: boolean = false
  formatter: Formatter = TextFormatter
  private output: any
  private isDiscard: boolean = false
  private colorProfile: string = ""
  private callerFormatter: CallerFormatter = ShortCallerFormatter
  private callerOffset: number = 0
  private timeFormat: string = "YYYY/MM/DD HH:mm:ss"
  private timeFunc: TimeFunction = (t) => t
  private fields: any[] = []
  private styles: Styles = DefaultStyles()
  private helpers: Set<string> = new Set()
  private mu: Mutex = new Mutex()
  private buffer: string = ""

  constructor(config: LoggerConfig = {}) {
    this.output = process.stderr
    if (config.level !== undefined) this.level = config.level
    if (config.prefix !== undefined) this.prefix = config.prefix
    if (config.timestamp !== undefined) this.reportTimestamp = config.timestamp
    if (config.caller !== undefined) this.reportCaller = config.caller
    if (config.formatter !== undefined) this.formatter = config.formatter

    if (config.theme) {
      let themeConfig: ThemeConfig
      if (typeof config.theme === "string") {
        const preset = getPreset(config.theme)
        if (!preset) throw new Error(`Unknown theme: ${config.theme}`)
        themeConfig = preset
      } else {
        themeConfig = config.theme
      }
      this.styles = applyTheme(themeConfig)
    }

    if (config.timeFormat) this.styles.TimeFormat = config.timeFormat
    if (config.separator) this.styles.SeparatorChar = config.separator
    if (config.indent) this.styles.IndentChar = config.indent
    if (config.multiline) this.styles.MultilineIndent = config.multiline
  }

  /**
   * Creates a new Logger with the given output writer and options.
   * @param w - Output writer (e.g., process.stderr). Pass null to discard output.
   * @param opts - Configuration options for the logger.
   * @returns A new Logger instance.
   */
  static newWithOptions(w: any, opts: Options | LoggerConfig = {}): Logger {
    const l = new Logger()
    l.output = w
    l.isDiscard = w == null
    if ("Level" in opts || "Prefix" in opts || "ReportTimestamp" in opts || "ReportCaller" in opts || "Formatter" in opts || "CallerFormatter" in opts || "CallerOffset" in opts || "Fields" in opts || "TimeFunction" in opts || "TimeFormat" in opts) {
      const o = opts as Options
      if (o.Level !== undefined) l.level = o.Level
      if (o.Prefix !== undefined) l.prefix = o.Prefix
      if (o.ReportTimestamp !== undefined) l.reportTimestamp = o.ReportTimestamp
      if (o.ReportCaller !== undefined) l.reportCaller = o.ReportCaller
      if (o.Formatter !== undefined) l.formatter = o.Formatter
      if (o.CallerFormatter !== undefined) l.callerFormatter = o.CallerFormatter
      if (o.CallerOffset !== undefined) l.callerOffset = o.CallerOffset
      if (o.Fields !== undefined) l.fields = [...o.Fields]
      if (o.TimeFunction !== undefined) l.timeFunc = o.TimeFunction
      if (o.TimeFormat !== undefined) l.timeFormat = o.TimeFormat
    } else {
      const c = opts as LoggerConfig
      if (c.level !== undefined) l.level = c.level
      if (c.prefix !== undefined) l.prefix = c.prefix
      if (c.timestamp !== undefined) l.reportTimestamp = c.timestamp
      if (c.caller !== undefined) l.reportCaller = c.caller
      if (c.formatter !== undefined) l.formatter = c.formatter

      if (c.theme) {
        let themeConfig: ThemeConfig
        if (typeof c.theme === "string") {
          const preset = getPreset(c.theme)
          if (!preset) throw new Error(`Unknown theme: ${c.theme}`)
          themeConfig = preset
        } else {
          themeConfig = c.theme
        }
        l.styles = applyTheme(themeConfig)
      } else {
        l.styles = DefaultStyles()
      }

      if (c.timeFormat) l.styles.TimeFormat = c.timeFormat
      if (c.separator) l.styles.SeparatorChar = c.separator
      if (c.indent) l.styles.IndentChar = c.indent
      if (c.multiline) l.styles.MultilineIndent = c.multiline
    }
    if (!("theme" in opts)) {
      l.styles = DefaultStyles()
    }
    return l
  }

  private resolveCaller(): string {
    const err = new Error()
    const stack = err.stack ?? ""
    const lines = stack.split("\n")
    let skip = 2 + this.callerOffset
    let callerLine = lines[skip] ?? ""
    while (this.helpers.size > 0) {
      const match = callerLine.match(/at\s+(.+?)(?:\s|\()/)
      if (match && this.helpers.has(match[1])) {
        skip++
        callerLine = lines[skip] ?? ""
      } else {
        break
      }
    }
    const callerMatch = callerLine.match(/at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?/)
    if (callerMatch) {
      const file = callerMatch[1]
      const line = parseInt(callerMatch[2], 10)
      const cacheKey = `${this.callerOffset}:${callerLine}`
      let cached = callerCache.get(cacheKey)
      if (cached === undefined) {
        if (callerCache.size >= CALLER_CACHE_MAX) {
          const firstKey = callerCache.keys().next().value
          if (firstKey !== undefined) callerCache.delete(firstKey)
        }
        cached = this.callerFormatter(file, line, "")
        callerCache.set(cacheKey, cached)
      }
      return cached
    }
    return ""
  }

  /** Marks the calling function as a helper, excluding it from caller reporting. */
  Helper(): void {
    this.mu.runExclusive(() => {
      const err = new Error()
      const stack = err.stack ?? ""
      const lines = stack.split("\n")
      const callerLine = lines[2] ?? ""
      const match = callerLine.match(/at\s+(.+?)(?:\s|\()/)
      if (match) {
        this.helpers.add(match[1])
      }
    })
  }

  /**
   * Checks if the logger is enabled for the given level.
   * @param level - The log level to check.
   * @returns True if messages at this level would be logged.
   */
  Enabled(level: Level): boolean {
    return this.mu.runExclusive(() => this.level <= level)
  }

  /**
   * Handles a structured log record (slog.Handler interface).
   * @param record - The log record containing level, message, time, and attributes.
   */
  Handle(record: { level: Level; message: string; time: Date; attrs: any[] }): void {
    const fields: any[] = []
    for (const attr of record.attrs) {
      fields.push(attr.Key, attr.Value)
    }
    this.log(record.level, record.message, ...fields)
  }

  /**
   * Returns a new handler with the given attributes added.
   * @param attrs - Array of SlogAttr objects to add as fields.
   * @returns A new SlogHandler with the additional attributes.
   */
  WithAttrs(attrs: any[]): SlogHandler {
    const fields: any[] = []
    for (const attr of attrs) {
      fields.push(attr.Key, attr.Value)
    }
    return this.with(...fields)
  }

  /**
   * Returns a new handler with the given group name added as a prefix.
   * @param name - The group name to prefix to subsequent keys.
   * @returns A new SlogHandler with the group applied.
   */
  WithGroup(name: string): SlogHandler {
    if (this.prefix) {
      name = this.prefix + "." + name
    }
    return this.withPrefix(name)
  }

  log(level: Level, msg: any, ...keyvals: any[]): void {
    if (this.isDiscard) return
    if (this.level > level && level !== NoLevel) return

    this.mu.runExclusive(() => {
      const len = 10 + this.fields.length + keyvals.length
      const kvs: any[] = new Array(len)
      let idx = 0

      if (this.reportTimestamp) {
        kvs[idx++] = TimestampKey
        kvs[idx++] = this.timeFunc(new Date())
      }

      if (level !== NoLevel && this.styles.Levels[level]) {
        kvs[idx++] = LevelKey
        kvs[idx++] = level
      }

      if (this.reportCaller) {
        const caller = this.resolveCaller()
        if (caller) {
          kvs[idx++] = CallerKey
          kvs[idx++] = caller
        }
      }

      if (this.prefix) {
        kvs[idx++] = PrefixKey
        kvs[idx++] = this.prefix
      }

      if (msg != null) {
        const m = String(msg)
        if (m !== "") {
          kvs[idx++] = MessageKey
          kvs[idx++] = m
        }
      }

      for (let i = 0; i < this.fields.length; i++) {
        kvs[idx++] = this.fields[i]
      }
      if (this.fields.length % 2 !== 0) {
        kvs[idx++] = ErrMissingValue
      }

      for (let i = 0; i < keyvals.length; i++) {
        kvs[idx++] = keyvals[i]
      }
      if (keyvals.length % 2 !== 0) {
        kvs[idx++] = ErrMissingValue
      }

      const slice = kvs.length === idx ? kvs : kvs.slice(0, idx)

      let line: string

      switch (this.formatter) {
        case JSONFormatter:
          line = jsonFormat(this.timeFormat, slice)
          break
        case LogfmtFormatter:
          line = logfmtFormat(this.timeFormat, slice)
          break
        case TextFormatter:
        default:
          line = textFormat(this.styles, this.timeFormat, slice)
          break
      }

      this.buffer += line + "\n"
      this.flush()
    })
  }

  private flush(): void {
    if (this.buffer.length > 0 && this.output) {
      this.output.write(this.buffer)
      this.buffer = ""
    }
  }

  logf(level: Level, format: string, ...args: any[]): void {
    const msg = sprintf(format, args)
    this.log(level, msg)
  }

  debug(msg: any, ...keyvals: any[]): void {
    this.log(DebugLevel, msg, ...keyvals)
  }

  info(msg: any, ...keyvals: any[]): void {
    this.log(InfoLevel, msg, ...keyvals)
  }

  warn(msg: any, ...keyvals: any[]): void {
    this.log(WarnLevel, msg, ...keyvals)
  }

  error(msg: any, ...keyvals: any[]): void {
    this.log(ErrorLevel, msg, ...keyvals)
  }

  fatal(msg: any, ...keyvals: any[]): void {
    this.log(FatalLevel, msg, ...keyvals)
    this.flush()
    process.exit(1)
  }

  print(msg: any, ...keyvals: any[]): void {
    this.log(NoLevel, msg, ...keyvals)
  }

  printf(format: string, ...args: any[]): void {
    const msg = sprintf(format, args)
    this.log(NoLevel, msg)
  }

  println(msg: any, ...keyvals: any[]): void {
    this.log(NoLevel, msg, ...keyvals)
  }

  debugf(format: string, ...args: any[]): void {
    this.logf(DebugLevel, format, ...args)
  }

  infof(format: string, ...args: any[]): void {
    this.logf(InfoLevel, format, ...args)
  }

  warnf(format: string, ...args: any[]): void {
    this.logf(WarnLevel, format, ...args)
  }

  errorf(format: string, ...args: any[]): void {
    this.logf(ErrorLevel, format, ...args)
  }

  fatalf(format: string, ...args: any[]): void {
    this.logf(FatalLevel, format, ...args)
    this.flush()
    process.exit(1)
  }

  with(...fields: any[]): Logger {
    return this.mu.runExclusive(() => {
      const l = new Logger()
      l.level = this.level
      l.prefix = this.prefix
      l.reportTimestamp = this.reportTimestamp
      l.reportCaller = this.reportCaller
      l.formatter = this.formatter
      l.output = this.output
      l.colorProfile = this.colorProfile
      l.callerFormatter = this.callerFormatter
      l.callerOffset = this.callerOffset
      l.timeFormat = this.timeFormat
      l.timeFunc = this.timeFunc
      l.styles = cloneStyles(this.styles)
      l.fields = [...this.fields, ...fields]
      l.helpers = new Set(this.helpers)
      return l
    })
  }

  withPrefix(prefix: string): Logger {
    const l = this.with()
    l.setPrefix(prefix)
    return l
  }

  setOutput(w: any): void {
    this.mu.runExclusive(() => {
      if (w == null) {
        this.isDiscard = true
        this.output = null
      } else {
        this.output = w
        this.isDiscard = false
      }
    })
  }

  setDiscard(): void {
    this.mu.runExclusive(() => {
      this.isDiscard = true
      this.output = null
    })
  }

  setColorProfile(profile: string): void {
    this.mu.runExclusive(() => { this.colorProfile = profile })
  }

  setCallerFormatter(f: CallerFormatter): void {
    this.mu.runExclusive(() => { this.callerFormatter = f })
  }

  setCallerOffset(offset: number): void {
    this.mu.runExclusive(() => { this.callerOffset = offset })
  }

  setFormatter(f: Formatter): void {
    this.mu.runExclusive(() => { this.formatter = f })
  }

  setLevel(level: Level): void {
    this.mu.runExclusive(() => { this.level = level })
  }

  getLevel(): Level {
    return this.mu.runExclusive(() => this.level)
  }

  setPrefix(prefix: string): void {
    this.mu.runExclusive(() => { this.prefix = prefix })
  }

  getPrefix(): string {
    return this.mu.runExclusive(() => this.prefix)
  }

  setReportTimestamp(report: boolean): void {
    this.mu.runExclusive(() => { this.reportTimestamp = report })
  }

  setReportCaller(report: boolean): void {
    this.mu.runExclusive(() => { this.reportCaller = report })
  }

  setTimeFormat(format: string): void {
    this.mu.runExclusive(() => { this.timeFormat = format })
  }

  setTimeFunction(f: TimeFunction): void {
    this.mu.runExclusive(() => { this.timeFunc = f })
  }

  setStyles(s: Styles): void {
    this.mu.runExclusive(() => {
      if (s == null) {
        this.styles = DefaultStyles()
      } else {
        this.styles = s
      }
    })
  }

  getStyles(): Styles {
    return this.mu.runExclusive(() => this.styles)
  }

  standardLog(opts?: StandardLogOptions): StandardLogLogger {
    const l = this.with()
    l.setCallerOffset((l.callerOffset || 0) + 3)
    const opt = opts ?? null

    function write(str: string): void {
      if (str.endsWith("\n")) {
        str = str.slice(0, -1)
      }

      if (opt?.ForceLevel !== undefined) {
        switch (opt.ForceLevel) {
          case DebugLevel: l.debug(str); break
          case InfoLevel: l.info(str); break
          case WarnLevel: l.warn(str); break
          case ErrorLevel: l.error(str); break
          case FatalLevel: l.fatal(str); break
        }
      } else {
        if (str.startsWith("DEBUG")) {
          l.debug(str.slice(5).trim())
        } else if (str.startsWith("INFO")) {
          l.info(str.slice(4).trim())
        } else if (str.startsWith("WARN")) {
          l.warn(str.slice(4).trim())
        } else if (str.startsWith("ERROR")) {
          l.error(str.slice(5).trim())
        } else if (str.startsWith("ERR")) {
          l.error(str.slice(3).trim())
        } else if (str.startsWith("FATAL")) {
          l.fatal(str.slice(5).trim())
        } else {
          l.info(str)
        }
      }
    }

    return {
      write(p: string): number {
        write(p)
        return p.length
      },
      output(_calldepth: number, s: string): void {
        write(s)
      },
      print(...args: any[]): void {
        write(args.join(" "))
      },
      printf(format: string, ...args: any[]): void {
        write(sprintf(format, args))
      },
      println(...args: any[]): void {
        write(args.join(" "))
      },
      panic(...args: any[]): void {
        const msg = args.join(" ")
        write(msg)
        throw new Error(msg)
      },
      panicf(format: string, ...args: any[]): void {
        const msg = sprintf(format, args)
        write(msg)
        throw new Error(msg)
      },
      panicln(...args: any[]): void {
        const msg = args.join(" ")
        write(msg)
        throw new Error(msg)
      },
      fatal(...args: any[]): void {
        write(args.join(" "))
        process.exit(1)
      },
      fatalf(format: string, ...args: any[]): void {
        write(sprintf(format, args))
        process.exit(1)
      },
      fatalln(...args: any[]): void {
        write(args.join(" "))
        process.exit(1)
      },
      flags(): number {
        return 0
      },
      setFlags(_flag: number): void {},
      prefix(): string {
        return ""
      },
      setPrefix(_prefix: string): void {},
      writer(): { write(data: string): number } {
        return { write: (data: string) => { write(data); return data.length } }
      },
      setOutput(_w: any): void {},
      log(...args: any[]) {
        write(args.join(" "))
      },
    }
  }
}

export const ContextKey = Symbol("sprinkles")

/**
 * Stores a Logger in a context object.
 * @param ctx - The context object to store the logger in.
 * @param logger - The Logger to store.
 * @returns A new context object with the logger attached.
 */
export function WithContext(ctx: any, logger: Logger): any {
  return { ...ctx, [ContextKey]: logger }
}

/**
 * Retrieves a Logger from a context object.
 * @param ctx - The context object to retrieve the logger from.
 * @returns The stored Logger, or the default logger if none is found.
 */
export function FromContext(ctx: any): Logger {
  return ctx?.[ContextKey] ?? _defaultLogger
}

let _defaultLogger: Logger | null = null

/**
 * Gets or creates the default logger instance.
 * @returns The default Logger writing to stderr with timestamps.
 */
export function Default(): Logger {
  if (_defaultLogger === null) {
    _defaultLogger = Logger.newWithOptions(process.stderr, { ReportTimestamp: true })
  }
  return _defaultLogger
}

export { Default as defaultLogger }

/**
 * Creates a new Logger writing to the given output.
 * @param w - Output writer (e.g., process.stderr).
 * @returns A new Logger instance.
 */
export function New(w: any): Logger {
  return Logger.newWithOptions(w, {})
}

/**
 * Creates a new Logger with the given output and options.
 * @param w - Output writer (e.g., process.stderr).
 * @param opts - Configuration options for the logger.
 * @returns A new Logger instance.
 */
export function NewWithOptions(w: any, opts: Options = {}): Logger {
  return Logger.newWithOptions(w, opts)
}

/**
 * Sets the default logger instance.
 * @param l - The Logger to use as the default.
 */
export function SetDefault(l: Logger): void {
  _defaultLogger = l
}

/**
 * Sets the output writer for the default logger.
 * @param w - Output writer (e.g., process.stderr).
 */
export function SetOutput(w: any): void {
  Default().setOutput(w)
}

/**
 * Sets the color profile for the default logger.
 * @param profile - The color profile identifier.
 */
export function SetColorProfile(profile: string): void {
  Default().setColorProfile(profile)
}

/**
 * Sets the caller formatter for the default logger.
 * @param f - A function that formats file, line, and function name into a string.
 */
export function SetCallerFormatter(f: CallerFormatter): void {
  Default().setCallerFormatter(f)
}

/**
 * Sets the caller stack offset for the default logger.
 * @param offset - Number of stack frames to skip.
 */
export function SetCallerOffset(offset: number): void {
  Default().setCallerOffset(offset)
}

/**
 * Sets the formatter for the default logger.
 * @param f - The formatter to use (TextFormatter, JSONFormatter, or LogfmtFormatter).
 */
export function SetFormatter(f: Formatter): void {
  Default().setFormatter(f)
}

/**
 * Sets the log level for the default logger.
 * @param level - Messages below this level are dropped.
 */
export function SetLevel(level: Level): void {
  Default().setLevel(level)
}

/**
 * Gets the log level of the default logger.
 * @returns The current log level.
 */
export function GetLevel(): Level {
  return Default().getLevel()
}

/**
 * Sets the prefix for the default logger.
 * @param prefix - The prefix string to prepend to log messages.
 */
export function SetPrefix(prefix: string): void {
  Default().setPrefix(prefix)
}

/**
 * Gets the prefix of the default logger.
 * @returns The current prefix string.
 */
export function GetPrefix(): string {
  return Default().getPrefix()
}

/**
 * Enables or disables timestamp reporting for the default logger.
 * @param report - True to include timestamps, false to omit.
 */
export function SetReportTimestamp(report: boolean): void {
  Default().setReportTimestamp(report)
}

/**
 * Enables or disables caller information reporting for the default logger.
 * @param report - True to include caller info, false to omit.
 */
export function SetReportCaller(report: boolean): void {
  Default().setReportCaller(report)
}

/**
 * Sets the timestamp format for the default logger.
 * @param format - Format string using YYYY, MM, DD, HH, mm, ss tokens.
 */
export function SetTimeFormat(format: string): void {
  Default().setTimeFormat(format)
}

/**
 * Sets a time transformation function for the default logger.
 * @param f - A function that transforms a Date (e.g., NowUTC for UTC conversion).
 */
export function SetTimeFunction(f: TimeFunction): void {
  Default().setTimeFunction(f)
}

/**
 * Sets the styling configuration for the default logger.
 * @param s - The styles to apply, or null for default styles.
 */
export function SetStyles(s: Styles): void {
  Default().setStyles(s)
}

/**
 * Returns a new Logger with the given fields added to the default logger.
 * @param keyvals - Alternating key-value pairs to attach.
 * @returns A new Logger instance with the additional fields.
 */
export function With(keyvals: any[]): Logger {
  return Default().with(...keyvals)
}

/**
 * Returns a new Logger with the given prefix set on the default logger.
 * @param prefix - The prefix string to prepend to log messages.
 * @returns A new Logger instance with the prefix applied.
 */
export function WithPrefix(prefix: string): Logger {
  return Default().withPrefix(prefix)
}

/** Marks the calling function as a helper on the default logger, excluding it from caller reporting. */
export function Helper(): void {
  Default().Helper()
}

/**
 * Returns a standard library-compatible logger backed by the default logger.
 * @param opts - Optional settings (e.g., ForceLevel to override detected level).
 * @returns A StandardLogLogger interface.
 */
export function StandardLog(opts?: StandardLogOptions): StandardLogLogger {
  return Default().standardLog(opts)
}

/**
 * Logs a message at debug level using the default logger.
 * @param msg - The log message.
 * @param keyvals - Alternating key-value pairs for structured logging.
 */
export function Debug(msg: any, ...keyvals: any[]): void {
  Default().debug(msg, ...keyvals)
}

/**
 * Logs a message at info level using the default logger.
 * @param msg - The log message.
 * @param keyvals - Alternating key-value pairs for structured logging.
 */
export function Info(msg: any, ...keyvals: any[]): void {
  Default().info(msg, ...keyvals)
}

/**
 * Logs a message at warn level using the default logger.
 * @param msg - The log message.
 * @param keyvals - Alternating key-value pairs for structured logging.
 */
export function Warn(msg: any, ...keyvals: any[]): void {
  Default().warn(msg, ...keyvals)
}

/**
 * Logs a message at error level using the default logger.
 * @param msg - The log message.
 * @param keyvals - Alternating key-value pairs for structured logging.
 */
export function LogError(msg: any, ...keyvals: any[]): void {
  Default().error(msg, ...keyvals)
}

/**
 * Logs a message at fatal level using the default logger and exits the process.
 * @param msg - The log message.
 * @param keyvals - Alternating key-value pairs for structured logging.
 */
export function Fatal(msg: any, ...keyvals: any[]): void {
  Default().fatal(msg, ...keyvals)
}

/**
 * Logs a message without a level prefix using the default logger.
 * @param msg - The log message.
 * @param keyvals - Alternating key-value pairs for structured logging.
 */
export function Print(msg: any, ...keyvals: any[]): void {
  Default().print(msg, ...keyvals)
}

/**
 * Logs a formatted message without a level prefix using the default logger.
 * @param format - Format string with % verbs.
 * @param args - Values to substitute into the format string.
 */
export function Printf(format: string, ...args: any[]): void {
  Default().printf(format, ...args)
}

/**
 * Logs a message without a level prefix using the default logger.
 * @param msg - The log message.
 * @param keyvals - Alternating key-value pairs for structured logging.
 */
export function Println(msg: any, ...keyvals: any[]): void {
  Default().println(msg, ...keyvals)
}

/**
 * Logs a message at the given level using the default logger.
 * @param level - Log level (e.g., InfoLevel, DebugLevel).
 * @param msg - The log message.
 * @param keyvals - Alternating key-value pairs for structured logging.
 */
export function Log(level: Level, msg: any, ...keyvals: any[]): void {
  Default().log(level, msg, ...keyvals)
}

/**
 * Logs a formatted message at the given level using the default logger.
 * @param level - Log level.
 * @param format - Format string with % verbs.
 * @param args - Values to substitute into the format string.
 */
export function Logf(level: Level, format: string, ...args: any[]): void {
  Default().logf(level, format, ...args)
}

/**
 * Logs a formatted message at debug level using the default logger.
 * @param format - Format string with % verbs.
 * @param args - Values to substitute into the format string.
 */
export function Debugf(format: string, ...args: any[]): void {
  Default().debugf(format, ...args)
}

/**
 * Logs a formatted message at info level using the default logger.
 * @param format - Format string with % verbs.
 * @param args - Values to substitute into the format string.
 */
export function Infof(format: string, ...args: any[]): void {
  Default().infof(format, ...args)
}

/**
 * Logs a formatted message at warn level using the default logger.
 * @param format - Format string with % verbs.
 * @param args - Values to substitute into the format string.
 */
export function Warnf(format: string, ...args: any[]): void {
  Default().warnf(format, ...args)
}

/**
 * Logs a formatted message at error level using the default logger.
 * @param format - Format string with % verbs.
 * @param args - Values to substitute into the format string.
 */
export function Errorf(format: string, ...args: any[]): void {
  Default().errorf(format, ...args)
}

/**
 * Logs a formatted message at fatal level using the default logger and exits the process.
 * @param format - Format string with % verbs.
 * @param args - Values to substitute into the format string.
 */
export function Fatalf(format: string, ...args: any[]): void {
  Default().fatalf(format, ...args)
}

// ── slog interop (equivalent to Go's slog.Attr/slog.Value/slog.LogValuer) ──

export interface SlogAttr {
  Key: string
  Value: SlogValue
}

export interface SlogValue {
  _kind: string
  _num?: number
  _str?: string
  _bool?: boolean
  _time?: Date
  _any?: any
}

export interface SlogLogValuer {
  LogValue(): SlogValue
}

/**
 * Creates a structured log attribute with any value.
 * @param key - The attribute key.
 * @param value - The attribute value (auto-detected as string, number, boolean, Date, or stringified).
 * @returns A SlogAttr object.
 */
export function SlogAttr(key: string, value: any): SlogAttr {
  return { Key: key, Value: SlogAny(value) }
}

/**
 * Creates a structured log attribute with a string value.
 * @param key - The attribute key.
 * @param value - The string value.
 * @returns A SlogAttr object.
 */
export function SlogString(key: string, value: string): SlogAttr {
  return { Key: key, Value: { _kind: "string", _str: value } }
}

/**
 * Creates a structured log attribute with an integer value.
 * @param key - The attribute key.
 * @param value - The integer value.
 * @returns A SlogAttr object.
 */
export function SlogInt(key: string, value: number): SlogAttr {
  return { Key: key, Value: { _kind: "int64", _num: value } }
}

/**
 * Creates a structured log attribute with a float64 value.
 * @param key - The attribute key.
 * @param value - The float64 value.
 * @returns A SlogAttr object.
 */
export function SlogFloat64(key: string, value: number): SlogAttr {
  return { Key: key, Value: { _kind: "float64", _num: value } }
}

/**
 * Creates a structured log attribute with a boolean value.
 * @param key - The attribute key.
 * @param value - The boolean value.
 * @returns A SlogAttr object.
 */
export function SlogBool(key: string, value: boolean): SlogAttr {
  return { Key: key, Value: { _kind: "bool", _bool: value } }
}

/**
 * Creates a structured log attribute with a time value.
 * @param key - The attribute key.
 * @param value - The Date value.
 * @returns A SlogAttr object.
 */
export function SlogTime(key: string, value: Date): SlogAttr {
  return { Key: key, Value: { _kind: "time", _time: value } }
}

/**
 * Converts any value to a SlogValue, auto-detecting its type.
 * @param value - The value to convert (null, string, number, boolean, Date, or LogValuer).
 * @returns A SlogValue representing the given value.
 */
export function SlogAny(value: any): SlogValue {
  if (value == null) return { _kind: "nil" }
  if (typeof value === "string") return { _kind: "string", _str: value }
  if (typeof value === "number") return { _kind: "float64", _num: value }
  if (typeof value === "boolean") return { _kind: "bool", _bool: value }
  if (value instanceof Date) return { _kind: "time", _time: value }
  if (typeof value === "object" && "LogValue" in value && typeof value.LogValue === "function") {
    return value.LogValue()
  }
  return { _kind: "string", _str: String(value) }
}

/**
 * Extracts the raw value from a SlogValue.
 * @param v - The SlogValue to unwrap.
 * @returns The unwrapped value (string, number, boolean, Date, or null).
 */
export function SlogValue(v: SlogValue): any {
  switch (v._kind) {
    case "string": return v._str
    case "int64":
    case "float64": return v._num
    case "bool": return v._bool
    case "time": return v._time
    case "nil": return null
    default: return v._any
  }
}
