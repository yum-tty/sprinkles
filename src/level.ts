export type Level = number

export const DebugLevel: Level = -4
export const InfoLevel: Level = 0
export const WarnLevel: Level = 4
export const ErrorLevel: Level = 8
export const FatalLevel: Level = 12
export const NoLevel: Level = Number.MAX_SAFE_INTEGER

export enum LogLevel {
  Debug = -4,
  Info = 0,
  Warn = 4,
  Error = 8,
  Fatal = 12,
}

const levelNames: Record<number, string> = {
  [-4]: "debug",
  [0]: "info",
  [4]: "warn",
  [8]: "error",
  [12]: "fatal",
}

export function LevelName(level: Level): string {
  return levelNames[level] ?? ""
}

export const ErrInvalidLevel = new Error("invalid level")

export function ParseLevel(name: string): { level: Level; error?: Error } {
  const lower = name.toLowerCase()
  for (const [key, val] of Object.entries(levelNames)) {
    if (val === lower) return { level: Number(key) as Level }
  }
  return { level: 0, error: ErrInvalidLevel }
}
