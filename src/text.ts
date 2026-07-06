import { Style } from "caramel"
import { Level, LevelName } from "./level"
import { Styles } from "./styles"
import { separator, indentSeparator } from "./logger"
import { escapeStringForOutput, needsQuoting, sprintf } from "./logger"
import { formatTime } from "./time"

export function textFormat(styles: Styles, timeFormat: string, kvs: any[]): string {
  const parts: string[] = []
  const keys = styles.OutputKeys

  for (let i = 0; i < kvs.length; i += 2) {
    const key = kvs[i]
    const value = kvs[i + 1]
    const moreKeys = i < kvs.length - 2

    switch (key) {
      case keys.timestamp: {
        if (value instanceof Date) {
          const ts = formatTime(value, timeFormat)
          parts.push(styles.Timestamp.render(ts))
        }
        break
      }
      case keys.level: {
        const lvl = LevelName(value as Level)
        if (lvl) {
          const lvlStyle = styles.Levels[value as Level]
          if (lvlStyle) {
            parts.push(lvlStyle.render())
          }
        }
        break
      }
      case keys.caller: {
        if (typeof value === "string") {
          const caller = styles.Caller.render(`<${value}>`)
          parts.push(caller)
        }
        break
      }
      case keys.prefix: {
        if (typeof value === "string") {
          const prefix = styles.Prefix.render(`${value}:`)
          parts.push(prefix)
        }
        break
      }
      case keys.message: {
        if (value != null) {
          const m = styles.Message.render(String(value))
          parts.push(m)
        }
        break
      }
      default: {
        const actualKey = String(key)
        let val = value != null ? (typeof value === 'object' ? goFormat(value) : String(value)) : ""
        const raw = val === ""
        if (raw) {
          val = '""'
        }
        if (actualKey === "") continue

        let valueStyle = styles.Value
        if (styles.ValueOverrides[actualKey]) {
          valueStyle = styles.ValueOverrides[actualKey]
        }

        let keyStr = actualKey
        if (styles.KeyOverrides[actualKey]) {
          keyStr = styles.KeyOverrides[actualKey].render(actualKey)
        } else {
          keyStr = styles.Key.render(actualKey)
        }

        const sep = styles.Separator.render(separator)
        const indentSep = styles.Separator.render(indentSeparator)

        if (val.includes("\n")) {
          parts.push(`\n  ${keyStr}${sep}\n`)
          const lines = writeIndent(styles, val, indentSep, moreKeys, actualKey)
          parts.push(lines)
        } else if (!raw && needsQuoting(val)) {
          const escaped = escapeStringForOutput(val, true)
          parts.push(`${keyStr}${sep}${valueStyle.render(`"${escaped}"`)}`)
        } else {
          parts.push(`${keyStr}${sep}${valueStyle.render(val)}`)
        }
        break
      }
    }
  }

  return parts.join(" ")
}

function writeIndent(styles: Styles, str: string, indent: string, newline: boolean, key: string): string {
  const lines = str.split("\n")
  const result: string[] = []

  for (let j = 0; j < lines.length; j++) {
    const line = lines[j]
    if (line !== "") {
      const escaped = escapeStringForOutput(line, false)
      let val: string
      if (styles.ValueOverrides[key]) {
        val = styles.ValueOverrides[key].render(escaped)
      } else {
        val = styles.Value.render(escaped)
      }
      result.push(indent + val)
    } else {
      result.push(indent)
    }
  }

  return result.join("\n")
}

function goFormat(obj: any): string {
  if (obj == null) return "<nil>"
  if (typeof obj === "string") return obj
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj)
  if (obj instanceof Error) return obj.message
  if (obj instanceof Date) return obj.toISOString()
  if (typeof obj === "object" && typeof obj.String === "function") return obj.String()
  if (typeof obj === "object" && typeof obj.LogValue === "function") return goFormat(obj.LogValue())
  if (Array.isArray(obj)) {
    return "[" + obj.map(v => goFormat(v)).join(" ") + "]"
  }
  const keys = Object.keys(obj)
  if (keys.length === 0) return "{}"
  const pairs = keys.map(k => `${k}:${goFormat(obj[k])}`)
  return `{${pairs.join(" ")}}`
}
