import { formatTime } from "./time"

export function logfmtFormat(timeFormat: string, kvs: any[]): string {
  const parts: string[] = []

  for (let i = 0; i < kvs.length; i += 2) {
    const key = String(kvs[i])
    if (i + 1 >= kvs.length) break
    const value = kvs[i + 1]

    if (value instanceof Date) {
      parts.push(`${key}=${escapeLogfmtValue(formatTime(value, timeFormat))}`)
    } else if (value instanceof Error) {
      parts.push(`${key}=${escapeLogfmtValue(value.message)}`)
    } else if (typeof value === "object" && value != null && typeof value.String === "function") {
      parts.push(`${key}=${escapeLogfmtValue(value.String())}`)
    } else {
      parts.push(`${key}=${escapeLogfmtValue(String(value ?? ""))}`)
    }
  }

  return parts.join(" ")
}

function escapeLogfmtValue(val: string): string {
  if (val === "" || val.includes(" ") || val.includes("=") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`
  }
  return val
}


