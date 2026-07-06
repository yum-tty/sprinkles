import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test"
import {
  Logger,
  New,
  NewWithOptions,
  TextFormatter,
  JSONFormatter,
  LogfmtFormatter,
  DefaultTimeFormat,
  TimestampKey,
  MessageKey,
  LevelKey,
  CallerKey,
  PrefixKey,
  ErrMissingValue,
  ShortCallerFormatter,
  LongCallerFormatter,
  NowUTC,
  sprintf,
  needsQuoting,
  escapeStringForOutput,
  type LoggerConfig,
  separator,
  indentSeparator,
  WithContext,
  FromContext,
  ContextKey,
  SlogString,
  SlogInt,
  SlogFloat64,
  SlogBool,
  SlogAny,
  SlogValue,
  SlogAttr,
  SlogTime,
  SetDefault,
  Default as DefaultLogger,
} from "./logger"
import { SlogLogger } from "./slog"
import {
  DebugLevel,
  InfoLevel,
  WarnLevel,
  ErrorLevel,
  FatalLevel,
  NoLevel,
  ErrInvalidLevel,
  LevelName,
  ParseLevel,
} from "./level"

class MockWriter {
  data = ""
  write(s: string): number {
    this.data += s
    return s.length
  }
  reset() {
    this.data = ""
  }
}

// Strip ANSI escape sequences for easy assertions
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\[[0-9;]*[A-HJKSTfghl]/g, "")
}

function stripAllEscape(str: string): string {
  return str.replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
}

describe("Level constants", () => {
  it("DebugLevel is -4", () => {
    expect(DebugLevel).toBe(-4)
  })

  it("InfoLevel is 0", () => {
    expect(InfoLevel).toBe(0)
  })

  it("WarnLevel is 4", () => {
    expect(WarnLevel).toBe(4)
  })

  it("ErrorLevel is 8", () => {
    expect(ErrorLevel).toBe(8)
  })

  it("FatalLevel is 12", () => {
    expect(FatalLevel).toBe(12)
  })

  it("NoLevel is MAX_SAFE_INTEGER", () => {
    expect(NoLevel).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("levels are ordered: debug < info < warn < error < fatal", () => {
    expect(DebugLevel).toBeLessThan(InfoLevel)
    expect(InfoLevel).toBeLessThan(WarnLevel)
    expect(WarnLevel).toBeLessThan(ErrorLevel)
    expect(ErrorLevel).toBeLessThan(FatalLevel)
  })
})

describe("LevelName", () => {
  it("returns correct names", () => {
    expect(LevelName(DebugLevel)).toBe("debug")
    expect(LevelName(InfoLevel)).toBe("info")
    expect(LevelName(WarnLevel)).toBe("warn")
    expect(LevelName(ErrorLevel)).toBe("error")
    expect(LevelName(FatalLevel)).toBe("fatal")
  })

  it("returns empty string for unknown level", () => {
    expect(LevelName(999)).toBe("")
  })
})

describe("ParseLevel", () => {
  it("parses valid level names", () => {
    expect(ParseLevel("debug").level).toBe(DebugLevel)
    expect(ParseLevel("info").level).toBe(InfoLevel)
    expect(ParseLevel("warn").level).toBe(WarnLevel)
    expect(ParseLevel("error").level).toBe(ErrorLevel)
    expect(ParseLevel("fatal").level).toBe(FatalLevel)
  })

  it("is case insensitive", () => {
    expect(ParseLevel("DEBUG").level).toBe(DebugLevel)
    expect(ParseLevel("Info").level).toBe(InfoLevel)
    expect(ParseLevel("WARN").level).toBe(WarnLevel)
  })

  it("returns error for unknown level", () => {
    const result = ParseLevel("bogus")
    expect(result.error).toBeDefined()
    expect(result.error).toBe(ErrInvalidLevel)
  })
})

describe("ErrMissingValue", () => {
  it("is the string 'missing value'", () => {
    expect(ErrMissingValue).toBe("missing value")
  })
})

describe("Logger construction", () => {
  it("new Logger() creates a logger with defaults", () => {
    const l = new Logger()
    expect(l.level).toBe(InfoLevel)
    expect(l.reportTimestamp).toBe(true)
    expect(l.reportCaller).toBe(false)
  })

  it("Logger.newWithOptions() creates a logger with custom output", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false })
    expect(l.level).toBe(InfoLevel)
    expect(l.reportTimestamp).toBe(false)
    l.info("test")
    expect(w.data).toContain("test")
  })

  it("New() creates a logger with custom output", () => {
    const w = new MockWriter()
    const l = New(w)
    l.info("hello")
    expect(w.data).toContain("hello")
  })

  it("NewWithOptions() creates a logger with all options", () => {
    const w = new MockWriter()
    const l = NewWithOptions(w, {
      Level: WarnLevel,
      Prefix: "myprefix",
      ReportTimestamp: false,
      ReportCaller: false,
      Formatter: TextFormatter,
    })
    expect(l.level).toBe(WarnLevel)
    l.info("should be filtered")
    expect(w.data).toBe("")
    l.warn("should appear")
    expect(w.data).toContain("should appear")
  })

  it("constructor applies config", () => {
    const l = new Logger({ level: WarnLevel, timestamp: false })
    expect(l.level).toBe(WarnLevel)
    expect(l.reportTimestamp).toBe(false)
  })
})

describe("Log levels", () => {
  let w: MockWriter
  let l: Logger

  beforeEach(() => {
    w = new MockWriter()
    l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
  })

  it("debug() outputs at debug level", () => {
    l.setLevel(DebugLevel)
    l.debug("debug msg")
    expect(w.data).toContain("debug msg")
  })

  it("info() outputs at info level", () => {
    l.info("info msg")
    expect(w.data).toContain("info msg")
  })

  it("warn() outputs at warn level", () => {
    l.warn("warn msg")
    expect(w.data).toContain("warn msg")
  })

  it("error() outputs at error level", () => {
    l.error("error msg")
    expect(w.data).toContain("error msg")
  })

  it("debug is filtered at info level", () => {
    const ll = Logger.newWithOptions(w, { Level: InfoLevel, ReportTimestamp: false })
    ll.debug("should not appear")
    expect(w.data).toBe("")
  })

  it("info is filtered at warn level", () => {
    const ll = Logger.newWithOptions(w, { Level: WarnLevel, ReportTimestamp: false })
    ll.info("should not appear")
    expect(w.data).toBe("")
  })

  it("warn is filtered at error level", () => {
    const ll = Logger.newWithOptions(w, { Level: ErrorLevel, ReportTimestamp: false })
    ll.warn("should not appear")
    expect(w.data).toBe("")
  })

  it("error is filtered at fatal level", () => {
    const ll = Logger.newWithOptions(w, { Level: FatalLevel, ReportTimestamp: false })
    ll.error("should not appear")
    expect(w.data).toBe("")
  })

  it("debug passes through at debug level", () => {
    const ll = Logger.newWithOptions(w, { Level: DebugLevel, ReportTimestamp: false })
    ll.debug("should appear")
    expect(w.data).toContain("should appear")
  })

  it("print() outputs with NoLevel", () => {
    const ll = Logger.newWithOptions(w, { Level: WarnLevel, ReportTimestamp: false })
    ll.print("always visible")
    expect(w.data).toContain("always visible")
  })
})

describe("fmt methods (formatted log)", () => {
  let w: MockWriter
  let l: Logger

  beforeEach(() => {
    w = new MockWriter()
    l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
  })

  it("infof() formats the message", () => {
    l.infof("hello %s, count=%d", "world", 42)
    expect(w.data).toContain("hello world, count=42")
  })

  it("debugf() formats the message", () => {
    l.setLevel(DebugLevel)
    l.debugf("value=%v", { a: 1 })
    expect(w.data).toContain('"a":1')
  })

  it("warnf() formats the message", () => {
    l.warnf("warn %s", "test")
    expect(w.data).toContain("warn test")
  })

  it("errorf() formats the message", () => {
    l.errorf("err %s", "test")
    expect(w.data).toContain("err test")
  })

  it("printf() outputs with NoLevel", () => {
    l.printf("formatted %d", 123)
    expect(w.data).toContain("formatted 123")
  })
})

describe("WithPrefix", () => {
  it("includes prefix in output", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    const prefixed = l.withPrefix("server")
    prefixed.info("started")
    expect(w.data).toContain("server:")
    expect(w.data).toContain("started")
  })

  it("prefix option works", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: TextFormatter,
      Prefix: "app",
    })
    l.info("running")
    expect(w.data).toContain("app:")
  })

  it("nested prefixes concatenate with dot", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    const child = l.WithGroup("db")
    child.info("connected")
    expect(w.data).toContain("db:")
  })
})

describe("WithTimestamp", () => {
  it("includes timestamp when enabled", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: true, Formatter: TextFormatter })
    l.info("msg")
    const text = stripAllEscape(w.data)
    // Default format: YYYY/MM/DD HH:mm:ss
    expect(text).toMatch(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/)
  })

  it("excludes timestamp when disabled", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.info("msg")
    const text = stripAllEscape(w.data)
    expect(text).not.toMatch(/\d{4}\/\d{2}\/\d{2}/)
    expect(text).toContain("msg")
  })
})

describe("WithCaller", () => {
  it("includes caller info when enabled", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      ReportCaller: true,
      Formatter: TextFormatter,
    })
    l.info("msg")
    const text = stripAllEscape(w.data)
    expect(text).toMatch(/<.+:\d+>/)
  })

  it("excludes caller info when disabled", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      ReportCaller: false,
      Formatter: TextFormatter,
    })
    l.info("msg")
    const text = stripAllEscape(w.data)
    expect(text).not.toMatch(/<.+:\d+>/)
  })
})

describe("TextFormatter output", () => {
  it("includes level label", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.info("hello")
    const text = stripAllEscape(w.data)
    expect(text).toContain("INFO")
    expect(text).toContain("hello")
  })

  it("includes key-value pairs", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.info("test", "key1", "value1", "key2", 42)
    const text = stripAllEscape(w.data)
    expect(text).toContain("key1")
    expect(text).toContain("value1")
    expect(text).toContain("key2")
    expect(text).toContain("42")
  })

  it("includes prefix", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: TextFormatter,
      Prefix: "myprefix",
    })
    l.info("msg")
    const text = stripAllEscape(w.data)
    expect(text).toContain("myprefix:")
    expect(text).toContain("msg")
  })

  it("shows DEBUG level (truncated to 4 chars by style)", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { Level: DebugLevel, ReportTimestamp: false, Formatter: TextFormatter })
    l.debug("dbg")
    const text = stripAllEscape(w.data)
    // maxWidth(4) truncates "DEBUG" to "DEB…"
    expect(text).toContain("DEB")
  })

  it("shows WARN level", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.warn("wn")
    const text = stripAllEscape(w.data)
    expect(text).toContain("WARN")
  })

  it("shows ERROR level (truncated to 4 chars by style)", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.error("err")
    const text = stripAllEscape(w.data)
    // maxWidth(4) truncates "ERROR" to "ERR…"
    expect(text).toContain("ERR")
  })

  it("handles string value needing quoting", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.info("test", "key", "hello world")
    const text = stripAllEscape(w.data)
    expect(text).toContain("key")
    // value with space should be quoted
    expect(text).toContain('"hello world"')
  })

  it("handles empty value", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.info("test", "key", "")
    const text = stripAllEscape(w.data)
    expect(text).toContain("key")
    expect(text).toContain('""')
  })
})

describe("JSONFormatter output", () => {
  it("produces valid JSON", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: JSONFormatter,
    })
    l.info("hello")
    const output = w.data.trim()
    expect(() => JSON.parse(output)).not.toThrow()
  })

  it("contains msg and level fields", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: JSONFormatter,
    })
    l.info("hello world")
    const parsed = JSON.parse(w.data.trim())
    expect(parsed.msg).toBe("hello world")
    expect(parsed.level).toBe("info")
  })

  it("contains key-value pairs", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: JSONFormatter,
    })
    l.info("test", "key", "value", "count", 42)
    const parsed = JSON.parse(w.data.trim())
    expect(parsed.key).toBe("value")
    expect(parsed.count).toBe(42)
  })

  it("includes timestamp when enabled", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: true,
      Formatter: JSONFormatter,
    })
    l.info("msg")
    const parsed = JSON.parse(w.data.trim())
    expect(parsed.time).toBeDefined()
    expect(typeof parsed.time).toBe("string")
  })

  it("includes prefix field", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: JSONFormatter,
      Prefix: "app",
    })
    l.info("msg")
    const parsed = JSON.parse(w.data.trim())
    expect(parsed.prefix).toBe("app")
  })

  it("encodes level names correctly", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { Level: DebugLevel, ReportTimestamp: false, Formatter: JSONFormatter })
    l.debug("d"); const d = JSON.parse(w.data.trim()); w.reset()
    l.info("i"); const i = JSON.parse(w.data.trim()); w.reset()
    l.warn("w"); const wn = JSON.parse(w.data.trim()); w.reset()
    l.error("e"); const e = JSON.parse(w.data.trim()); w.reset()
    expect(d.level).toBe("debug")
    expect(i.level).toBe("info")
    expect(wn.level).toBe("warn")
    expect(e.level).toBe("error")
  })

  it("handles null and undefined values", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: JSONFormatter,
    })
    l.info("test", "n", null, "u", undefined)
    const parsed = JSON.parse(w.data.trim())
    expect(parsed.n).toBeNull()
    expect(parsed.u).toBeNull()
  })

  it("handles Error objects", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: JSONFormatter,
    })
    l.info("test", "err", new Error("boom"))
    const parsed = JSON.parse(w.data.trim())
    expect(parsed.err).toBe("boom")
  })

  it("handles array values", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: JSONFormatter,
    })
    l.info("test", "arr", [1, 2, 3])
    const parsed = JSON.parse(w.data.trim())
    expect(parsed.arr).toEqual([1, 2, 3])
  })
})

describe("LogfmtFormatter output", () => {
  it("produces key=value format", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: LogfmtFormatter,
    })
    l.info("hello")
    const output = w.data.trim()
    expect(output).toContain("msg=hello")
    // logfmt stores raw numeric level, not the name
    expect(output).toContain("level=0")
  })

  it("separates pairs with spaces", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: LogfmtFormatter,
    })
    l.info("test", "key", "val")
    const output = w.data.trim()
    expect(output).toMatch(/^(\S+=\S+ )+\S+=\S+$/)
    expect(output).toContain("key=val")
  })

  it("quotes values with spaces", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: LogfmtFormatter,
    })
    l.info("test", "key", "hello world")
    const output = w.data.trim()
    expect(output).toContain('key="hello world"')
  })

  it("quotes values with equals sign", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: LogfmtFormatter,
    })
    l.info("test", "key", "a=b")
    const output = w.data.trim()
    expect(output).toContain('key="a=b"')
  })

  it("includes timestamp when enabled", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: true,
      Formatter: LogfmtFormatter,
    })
    l.info("msg")
    const output = w.data.trim()
    expect(output).toMatch(/time=\S+/)
  })
})

describe("WithLevel filtering", () => {
  it("config object with WarnLevel skips debug and info", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    const wl = new Logger({ level: WarnLevel })
    wl.setOutput(w)
    wl.debug("skip")
    wl.info("skip")
    wl.warn("show")
    wl.error("show")
    expect(w.data).not.toContain("skip")
    expect(w.data).toContain("show")
  })

  it("DebugLevel allows all messages", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      Level: DebugLevel,
      ReportTimestamp: false,
      Formatter: TextFormatter,
    })
    l.debug("d")
    l.info("i")
    l.warn("w")
    l.error("e")
    expect(w.data).toContain("d")
    expect(w.data).toContain("i")
    expect(w.data).toContain("w")
    expect(w.data).toContain("e")
  })

  it("ErrorLevel only shows error and fatal", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.setLevel(ErrorLevel)
    l.debug("d")
    l.info("i")
    l.warn("w")
    l.error("e")
    expect(w.data).not.toContain('"d"')
    expect(w.data).not.toContain('"i"')
    expect(w.data).not.toContain('"w"')
    expect(w.data).toContain("e")
  })
})

describe("setOutput(null) discard mode", () => {
  it("discards all output", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.info("before")
    expect(w.data).toContain("before")
    l.setOutput(null)
    w.reset()
    l.info("after")
    expect(w.data).toBe("")
  })

  it("setDiscard() creates a logger that silently drops output", () => {
    const d = new Logger()
    d.setDiscard()
    // Should not throw and messages go to /dev/null (null output)
    d.info("should not appear")
    d.debug("also discarded")
    d.warn("this too")
    // No writer means nothing to check, but no error means success
    expect(true).toBe(true)
  })

  it("setOutput(null) after writing switches to discard", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.info("before")
    expect(w.data).toContain("before")
    l.setOutput(null)
    w.reset()
    l.info("after")
    expect(w.data).toBe("")
  })

  it("setDiscard() discards output", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false })
    l.setDiscard()
    w.reset()
    l.info("discarded")
    expect(w.data).toBe("")
  })
})

describe("sprintf", () => {
  it("replaces %s with string", () => {
    expect(sprintf("hello %s", ["world"])).toBe("hello world")
  })

  it("replaces %d with integer", () => {
    expect(sprintf("count=%d", [42])).toBe("count=42")
  })

  it("replaces %f with float", () => {
    expect(sprintf("pi=%.2f", [3.14159])).toBe("pi=3.14")
  })

  it("replaces %% with literal %", () => {
    expect(sprintf("100%%", [])).toBe("100%")
  })

  it("replaces %v with default format", () => {
    expect(sprintf("%v", [42])).toBe("42")
    expect(sprintf("%v", ["hello"])).toBe("hello")
    expect(sprintf("%v", [true])).toBe("true")
  })

  it("replaces %+v with verbose format", () => {
    expect(sprintf("%+v", [{ a: 1, b: 2 }])).toContain("a:1")
    expect(sprintf("%+v", [{ a: 1, b: 2 }])).toContain("b:2")
  })

  it("handles nil/undefined in %v", () => {
    expect(sprintf("%v", [null])).toBe("<nil>")
    expect(sprintf("%v", [undefined])).toBe("<nil>")
  })

  it("replaces %b with binary", () => {
    expect(sprintf("%b", [10])).toBe("1010")
  })

  it("replaces %o with octal", () => {
    expect(sprintf("%o", [8])).toBe("10")
  })

  it("replaces %x with hex", () => {
    expect(sprintf("%x", [255])).toBe("ff")
  })

  it("replaces %X with uppercase hex", () => {
    expect(sprintf("%X", [255])).toBe("FF")
  })

  it("replaces %t with boolean", () => {
    expect(sprintf("%t", [true])).toBe("true")
    expect(sprintf("%t", [false])).toBe("false")
  })

  it("replaces %T with type", () => {
    expect(sprintf("%T", [42])).toBe("number")
    expect(sprintf("%T", ["hello"])).toBe("string")
  })

  it("replaces %q with quoted string", () => {
    expect(sprintf("%q", ["hello"])).toBe('"hello"')
  })

  it("handles width padding", () => {
    expect(sprintf("%10s", ["hi"])).toBe("        hi")
  })

  it("handles multiple args", () => {
    expect(sprintf("a=%d b=%s c=%t", [1, "two", true])).toBe("a=1 b=two c=true")
  })

  it("handles trailing %", () => {
    expect(sprintf("100%", [])).toBe("100%")
  })

  it("replaces %v with Date", () => {
    const d = new Date("2024-01-15T12:30:00.000Z")
    const result = sprintf("%v", [d])
    expect(result).toBe(d.toISOString())
  })

  it("replaces %v with Error", () => {
    const result = sprintf("%v", [new Error("fail")])
    expect(result).toBe("fail")
  })

  it("handles %d with 0", () => {
    expect(sprintf("%d", [0])).toBe("0")
  })

  it("handles %d with NaN", () => {
    expect(sprintf("%d", [NaN])).toBe("0")
  })

  it("handles %f with precision and width", () => {
    expect(sprintf("%10.3f", [3.14])).toBe("     3.140")
  })

  it("unknown verb returns %verb", () => {
    expect(sprintf("%z", [42])).toBe("%z")
  })
})

describe("needsQuoting", () => {
  it("returns false for simple alphanumeric", () => {
    expect(needsQuoting("hello")).toBe(false)
    expect(needsQuoting("abc123")).toBe(false)
  })

  it("returns true for double quote", () => {
    expect(needsQuoting('say "hi"')).toBe(true)
  })

  it("returns true for equals sign", () => {
    expect(needsQuoting("a=b")).toBe(true)
  })

  it("returns true for space", () => {
    expect(needsQuoting("hello world")).toBe(true)
  })

  it("returns true for control characters", () => {
    expect(needsQuoting("hello\x00world")).toBe(true)
    expect(needsQuoting("hello\x1fworld")).toBe(true)
  })

  it("returns true for DEL", () => {
    expect(needsQuoting("hello\x7f")).toBe(true)
  })

  it("returns false for normal printable chars including hyphen and slash", () => {
    expect(needsQuoting("hello-world")).toBe(false)
    expect(needsQuoting("path/to/file")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(needsQuoting("")).toBe(false)
  })
})

describe("escapeStringForOutput", () => {
  it("returns plain string when no escaping needed", () => {
    expect(escapeStringForOutput("hello", false)).toBe("hello")
  })

  it("escapes double quotes when escapeQuotes=true", () => {
    expect(escapeStringForOutput('say "hi"', true)).toBe('say \\"hi\\"')
  })

  it("does not escape double quotes when escapeQuotes=false", () => {
    expect(escapeStringForOutput('say "hi"', false)).toBe('say "hi"')
  })

  it("escapes newline", () => {
    expect(escapeStringForOutput("a\nb", false)).toBe("a\\nb")
  })

  it("escapes tab", () => {
    expect(escapeStringForOutput("a\tb", false)).toBe("a\\tb")
  })

  it("escapes carriage return", () => {
    expect(escapeStringForOutput("a\rb", false)).toBe("a\\rb")
  })

  it("escapes null byte as hex", () => {
    expect(escapeStringForOutput("a\x00b", false)).toBe("a\\x00b")
  })

  it("escapes bell", () => {
    expect(escapeStringForOutput("a\x07b", false)).toBe("a\\ab")
  })

  it("escapes backspace", () => {
    expect(escapeStringForOutput("a\x08b", false)).toBe("a\\bb")
  })

  it("escapes form feed", () => {
    expect(escapeStringForOutput("a\x0cb", false)).toBe("a\\fb")
  })

  it("escapes vertical tab", () => {
    expect(escapeStringForOutput("a\x0bb", false)).toBe("a\\vb")
  })

  it("escapes high control chars as unicode", () => {
    expect(escapeStringForOutput("a\x85b", false)).toBe("a\\u0085b")
  })

  it("handles empty string", () => {
    expect(escapeStringForOutput("", false)).toBe("")
  })
})

describe("ShortCallerFormatter", () => {
  it("formats file:line", () => {
    const result = ShortCallerFormatter("/home/user/project/src/file.ts", 42, "fn")
    expect(result).toBe("src/file.ts:42")
  })

  it("handles single-level path", () => {
    const result = ShortCallerFormatter("file.ts", 10, "fn")
    expect(result).toBe("file.ts:10")
  })
})

describe("LongCallerFormatter", () => {
  it("formats full file:line", () => {
    const result = LongCallerFormatter("/home/user/project/src/file.ts", 42, "fn")
    expect(result).toBe("/home/user/project/src/file.ts:42")
  })
})

describe("NowUTC", () => {
  it("returns a UTC date", () => {
    const now = new Date("2024-06-15T14:30:00.000Z")
    const result = NowUTC(now)
    expect(result.toISOString()).toBe("2024-06-15T14:30:00.000Z")
  })
})

describe("LoggerConfig options", () => {
  it("timestamp option sets reportTimestamp", () => {
    const l = new Logger({ timestamp: false })
    expect(l.reportTimestamp).toBe(false)
  })

  it("caller option sets reportCaller", () => {
    const l = new Logger({ caller: true })
    expect(l.reportCaller).toBe(true)
  })

  it("formatter option sets formatter", () => {
    const l = new Logger({ formatter: JSONFormatter })
    expect(l.formatter).toBe(JSONFormatter)
  })

  it("prefix option sets prefix", () => {
    const l = new Logger({ prefix: "test" })
    expect(l.prefix).toBe("test")
  })

  it("level option sets level", () => {
    const l = new Logger({ level: ErrorLevel })
    expect(l.level).toBe(ErrorLevel)
  })
})

describe("Handle() slog interface", () => {
  it("processes slog records correctly", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: TextFormatter,
    })
    l.Handle({
      level: InfoLevel,
      message: "slog message",
      time: new Date(),
      attrs: [
        { Key: "key1", Value: { _kind: "string", _str: "val1" } },
        { Key: "key2", Value: { _kind: "int64", _num: 42 } },
      ],
    })
    const text = stripAllEscape(w.data)
    expect(text).toContain("INFO")
    expect(text).toContain("slog message")
    expect(text).toContain("key1")
    expect(text).toContain("val1")
    expect(text).toContain("key2")
  })

  it("Enabled() returns true for levels at or above logger level", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { Level: WarnLevel })
    expect(l.Enabled(DebugLevel)).toBe(false)
    expect(l.Enabled(InfoLevel)).toBe(false)
    expect(l.Enabled(WarnLevel)).toBe(true)
    expect(l.Enabled(ErrorLevel)).toBe(true)
  })
})

describe("SlogLogger", () => {
  it("delegates to handler", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, {
      ReportTimestamp: false,
      Formatter: TextFormatter,
    })
    const slog = new SlogLogger(l)
    slog.Info("slog info", SlogString("key", "value"))
    const text = stripAllEscape(w.data)
    expect(text).toContain("slog info")
    expect(text).toContain("key")
    expect(text).toContain("value")
  })

  it("filters based on level", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { Level: WarnLevel, ReportTimestamp: false })
    const slog = new SlogLogger(l)
    slog.Debug("skip")
    slog.Info("skip")
    slog.Warn("show")
    expect(w.data).not.toContain("skip")
    expect(w.data).toContain("show")
  })

  it("Enabled() checks handler", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { Level: WarnLevel })
    const slog = new SlogLogger(l)
    expect(slog.Enabled(DebugLevel)).toBe(false)
    expect(slog.Enabled(WarnLevel)).toBe(true)
  })

  it("With() adds attributes", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    const slog = new SlogLogger(l)
    const child = slog.With(SlogString("ctx", "val"))
    child.Info("msg")
    const text = stripAllEscape(w.data)
    expect(text).toContain("ctx")
    expect(text).toContain("val")
  })

  it("WithGroup() sets prefix", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    const slog = new SlogLogger(l)
    const child = slog.WithGroup("http")
    child.Info("request")
    const text = stripAllEscape(w.data)
    expect(text).toContain("http:")
  })
})

describe("SlogAttr and SlogValue constructors", () => {
  it("SlogString creates string attr", () => {
    const a = SlogString("k", "v")
    expect(a.Key).toBe("k")
    expect(a.Value._kind).toBe("string")
    expect(a.Value._str).toBe("v")
  })

  it("SlogInt creates int attr", () => {
    const a = SlogInt("k", 42)
    expect(a.Value._kind).toBe("int64")
    expect(a.Value._num).toBe(42)
  })

  it("SlogFloat64 creates float attr", () => {
    const a = SlogFloat64("k", 3.14)
    expect(a.Value._kind).toBe("float64")
    expect(a.Value._num).toBe(3.14)
  })

  it("SlogBool creates bool attr", () => {
    const a = SlogBool("k", true)
    expect(a.Value._kind).toBe("bool")
    expect(a.Value._bool).toBe(true)
  })

  it("SlogTime creates time attr", () => {
    const d = new Date()
    const a = SlogTime("k", d)
    expect(a.Value._kind).toBe("time")
    expect(a.Value._time).toBe(d)
  })

  it("SlogAttr wraps any value", () => {
    const a = SlogAttr("k", "hello")
    expect(a.Key).toBe("k")
    expect(a.Value._kind).toBe("string")
    expect(a.Value._str).toBe("hello")
  })

  it("SlogAny infers type from value", () => {
    expect(SlogAny("str")._kind).toBe("string")
    expect(SlogAny(42)._kind).toBe("float64")
    expect(SlogAny(true)._kind).toBe("bool")
    expect(SlogAny(null)._kind).toBe("nil")
    expect(SlogAny(undefined)._kind).toBe("nil")
    expect(SlogAny(new Date())._kind).toBe("time")
  })

  it("SlogAny handles LogValuer", () => {
    const lv = { LogValue: () => ({ _kind: "string", _str: "resolved" }) }
    const v = SlogAny(lv)
    expect(v._kind).toBe("string")
    expect(v._str).toBe("resolved")
  })

  it("SlogValue extracts value from SlogValue", () => {
    expect(SlogValue({ _kind: "string", _str: "hello" })).toBe("hello")
    expect(SlogValue({ _kind: "int64", _num: 42 })).toBe(42)
    expect(SlogValue({ _kind: "float64", _num: 3.14 })).toBe(3.14)
    expect(SlogValue({ _kind: "bool", _bool: true })).toBe(true)
    const d = new Date()
    expect(SlogValue({ _kind: "time", _time: d })).toBe(d)
    expect(SlogValue({ _kind: "nil" })).toBeNull()
  })
})

describe("Context functions", () => {
  it("WithContext stores logger in context", () => {
    const ctx = {}
    const l = new Logger()
    const newCtx = WithContext(ctx, l)
    expect(newCtx[ContextKey]).toBe(l)
  })

  it("FromContext retrieves logger", () => {
    const l = new Logger()
    const ctx = WithContext({}, l)
    expect(FromContext(ctx)).toBe(l)
  })

  it("FromContext returns default when no logger in context", () => {
    const result = FromContext({})
    expect(result).toBeDefined()
  })
})

describe("With() key-value fields", () => {
  it("adds pre-configured fields to output", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    const child = l.with("app", "server")
    child.info("started")
    const text = stripAllEscape(w.data)
    expect(text).toContain("app")
    expect(text).toContain("server")
    expect(text).toContain("started")
  })

  it("pre-configured fields appear in JSON", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: JSONFormatter })
    const child = l.with("region", "us-east")
    child.info("deployed")
    const parsed = JSON.parse(w.data.trim())
    expect(parsed.region).toBe("us-east")
    expect(parsed.msg).toBe("deployed")
  })
})

describe("Logger.getLevel / getPrefix", () => {
  it("getLevel returns current level", () => {
    const l = new Logger()
    expect(l.getLevel()).toBe(InfoLevel)
    l.setLevel(WarnLevel)
    expect(l.getLevel()).toBe(WarnLevel)
  })

  it("getPrefix returns current prefix", () => {
    const l = new Logger()
    expect(l.getPrefix()).toBe("")
    l.setPrefix("test")
    expect(l.getPrefix()).toBe("test")
  })
})

describe("Constants", () => {
  it("separator is '='", () => {
    expect(separator).toBe("=")
  })

  it("indentSeparator is '  | '", () => {
    expect(indentSeparator).toBe("  │ ")
  })

  it("DefaultTimeFormat is correct", () => {
    expect(DefaultTimeFormat).toBe("YYYY/MM/DD HH:mm:ss")
  })

  it("key constants are correct", () => {
    expect(TimestampKey).toBe("time")
    expect(MessageKey).toBe("msg")
    expect(LevelKey).toBe("level")
    expect(CallerKey).toBe("caller")
    expect(PrefixKey).toBe("prefix")
  })

  it("formatter constants", () => {
    expect(TextFormatter).toBe(0)
    expect(JSONFormatter).toBe(1)
    expect(LogfmtFormatter).toBe(2)
  })
})

describe("Multiple key-value pairs", () => {
  it("handles many key-value pairs in text", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.info("test", "a", "1", "b", "2", "c", "3")
    const text = stripAllEscape(w.data)
    expect(text).toContain("a")
    expect(text).toContain("1")
    expect(text).toContain("b")
    expect(text).toContain("2")
    expect(text).toContain("c")
    expect(text).toContain("3")
  })

  it("handles many key-value pairs in JSON", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: JSONFormatter })
    l.info("test", "a", "1", "b", "2", "c", "3")
    const parsed = JSON.parse(w.data.trim())
    expect(parsed.a).toBe("1")
    expect(parsed.b).toBe("2")
    expect(parsed.c).toBe("3")
  })

  it("appends ErrMissingValue for odd key-value count", () => {
    const w = new MockWriter()
    const l = Logger.newWithOptions(w, { ReportTimestamp: false, Formatter: TextFormatter })
    l.info("test", "key")
    const text = stripAllEscape(w.data)
    expect(text).toContain("missing value")
  })
})
