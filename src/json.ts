import { Level, LevelName } from "./level"
import { TimestampKey, MessageKey, LevelKey, CallerKey, PrefixKey } from "./logger"
import { formatTime } from "./time"

export function jsonFormat(timeFormat: string, kvs: any[]): string {
  const parts: string[] = []

  for (let i = 0; i < kvs.length; i += 2) {
    const key = String(kvs[i])
    if (i + 1 >= kvs.length) break
    const value = kvs[i + 1]

    if (key) {
      if (parts.length > 0) parts.push(",")
      parts.push(`${JSON.stringify(key)}:`)
      if (key === LevelKey) {
        parts.push(JSON.stringify(LevelName(value as Level)))
      } else {
        parts.push(jsonEncodeValue(timeFormat, value))
      }
    }
  }

  return `{${parts.join("")}}`
}

function jsonEncodeValue(timeFormat: string, value: any): string {
  const encode = (v: any): string => {
    let s: string
    if (v instanceof Date) {
      s = JSON.stringify(formatTime(v, timeFormat))
    } else if (v instanceof Error) {
      s = JSON.stringify(v.message)
    } else if (typeof v === "string") {
      s = JSON.stringify(v)
    } else if (typeof v === "number" || typeof v === "boolean") {
      return String(v)
    } else if (v == null) {
      return "null"
    } else if (typeof v === "object" && typeof v.LogValue === "function") {
      return encode(v.LogValue())
    } else if (typeof v === "object" && typeof v.String === "function") {
      s = JSON.stringify(v.String())
    } else if (Array.isArray(v)) {
      s = JSON.stringify(v)
    } else {
      try {
        s = JSON.stringify(v)
      } catch {
        return `"${String(v)}"`
      }
    }
    return s
  }
  return encode(value)
}


