import { Style } from "caramel"
import type { Styles } from "./styles"
import { DefaultStyles } from "./styles"
import { DebugLevel, InfoLevel, WarnLevel, ErrorLevel, FatalLevel } from "./level"

export interface StyleConfig {
  foreground?: string
  background?: string
  bold?: boolean
  faint?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
}

export interface LevelStyleConfig extends StyleConfig {
  label?: string
}

export interface ThemeConfig {
  timestamp?: StyleConfig
  caller?: StyleConfig
  prefix?: StyleConfig
  message?: StyleConfig
  key?: StyleConfig
  value?: StyleConfig
  pair?: StyleConfig

  levels?: {
    debug?: LevelStyleConfig
    info?: LevelStyleConfig
    warn?: LevelStyleConfig
    error?: LevelStyleConfig
    fatal?: LevelStyleConfig
  }

  keys?: {
    timestamp?: string
    message?: string
    level?: string
    caller?: string
    prefix?: string
  }

  separator?: string
  indent?: string
  multiline?: string

  timeFormat?: string

  callerWrapIn?: string
  callerWrapOut?: string
  callerSegments?: number

  prettyJSON?: boolean

  defaults?: {
    level?: string
    timestamp?: boolean
    caller?: boolean
    formatter?: string
  }
}

function applyStyleConfig(base: Style, config?: StyleConfig): Style {
  if (!config) return base
  let s = base
  if (config.foreground) s = s.foreground(config.foreground)
  if (config.background) s = s.background(config.background)
  if (config.bold !== undefined) s = s.bold(config.bold)
  if (config.faint !== undefined) s = s.faint(config.faint)
  if (config.italic !== undefined) s = s.italic(config.italic)
  if (config.underline !== undefined) s = s.underline(config.underline)
  if (config.strikethrough !== undefined) s = s.strikethrough(config.strikethrough)
  return s
}

export function applyTheme(config: ThemeConfig): Styles {
  const s = DefaultStyles()

  s.Timestamp = applyStyleConfig(s.Timestamp, config.timestamp)
  s.Caller = applyStyleConfig(s.Caller, config.caller)
  s.Prefix = applyStyleConfig(s.Prefix, config.prefix)
  s.Message = applyStyleConfig(s.Message, config.message)
  s.Key = applyStyleConfig(s.Key, config.key)
  s.Value = applyStyleConfig(s.Value, config.value)
  s.Separator = applyStyleConfig(s.Separator, config.pair)

  if (config.levels) {
    const levelMap: Record<string, { level: number; label: string }> = {
      debug: { level: DebugLevel, label: "DEBUG" },
      info: { level: InfoLevel, label: "INFO" },
      warn: { level: WarnLevel, label: "WARN" },
      error: { level: ErrorLevel, label: "ERROR" },
      fatal: { level: FatalLevel, label: "FATAL" },
    }
    for (const [name, cfg] of Object.entries(config.levels)) {
      const entry = levelMap[name]
      if (entry && s.Levels[entry.level]) {
        const label = cfg.label ?? entry.label
        s.Levels[entry.level] = applyStyleConfig(
          s.Levels[entry.level].setString(label),
          cfg,
        )
      }
    }
  }

  if (config.keys) {
    if (config.keys.timestamp) s.OutputKeys.timestamp = config.keys.timestamp
    if (config.keys.message) s.OutputKeys.message = config.keys.message
    if (config.keys.level) s.OutputKeys.level = config.keys.level
    if (config.keys.caller) s.OutputKeys.caller = config.keys.caller
    if (config.keys.prefix) s.OutputKeys.prefix = config.keys.prefix
  }

  if (config.separator !== undefined) s.SeparatorChar = config.separator
  if (config.indent !== undefined) s.IndentChar = config.indent
  if (config.multiline !== undefined) s.MultilineIndent = config.multiline
  if (config.timeFormat !== undefined) s.TimeFormat = config.timeFormat
  if (config.callerWrapIn !== undefined) s.CallerWrapIn = config.callerWrapIn
  if (config.callerWrapOut !== undefined) s.CallerWrapOut = config.callerWrapOut
  if (config.callerSegments !== undefined) s.CallerSegments = config.callerSegments
  if (config.prettyJSON !== undefined) s.PrettyJSON = config.prettyJSON

  return s
}

export async function loadTheme(path: string): Promise<ThemeConfig> {
  const file = Bun.file(path)
  const text = await file.text()
  return JSON.parse(text) as ThemeConfig
}

// ── Built-in presets ──

const dark: ThemeConfig = {
  pair: { faint: true },
  levels: {
    debug: { foreground: "63", bold: true },
    info: { foreground: "86", bold: true },
    warn: { foreground: "192", bold: true },
    error: { foreground: "204", bold: true },
    fatal: { foreground: "134", bold: true },
  },
}

const light: ThemeConfig = {
  timestamp: { foreground: "#666666" },
  caller: { foreground: "#999999" },
  prefix: { foreground: "#333333", bold: true },
  message: { foreground: "#000000" },
  key: { foreground: "#666666" },
  value: { foreground: "#333333" },
  pair: { foreground: "#999999" },
  levels: {
    debug: { foreground: "#666666", bold: true },
    info: { foreground: "#0066cc", bold: true },
    warn: { foreground: "#cc8800", bold: true },
    error: { foreground: "#cc0000", bold: true },
    fatal: { foreground: "#880088", bold: true },
  },
}

export const presets: Record<string, ThemeConfig> = {
  dark,
  light,
}

export function getPreset(name: string): ThemeConfig | null {
  return presets[name] ?? null
}
