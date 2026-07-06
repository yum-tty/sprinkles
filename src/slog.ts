import { Level } from "./level"
import { Logger, SlogHandler, type SlogAttr } from "./logger"

export type { SlogHandler }

export type SlogLevel = Level

export interface SlogRecord {
  level: SlogLevel
  message: string
  time: Date
  attrs: SlogAttr[]
}

export class SlogLogger {
  private handler: SlogHandler

  constructor(handler: SlogHandler) {
    this.handler = handler
  }

  Enabled(level: SlogLevel): boolean {
    return this.handler.Enabled(level)
  }

  Debug(msg: string, ...attrs: SlogAttr[]): void {
    this.log(-4, msg, ...attrs)
  }

  Info(msg: string, ...attrs: SlogAttr[]): void {
    this.log(0, msg, ...attrs)
  }

  Warn(msg: string, ...attrs: SlogAttr[]): void {
    this.log(4, msg, ...attrs)
  }

  Error(msg: string, ...attrs: SlogAttr[]): void {
    this.log(8, msg, ...attrs)
  }

  private log(level: SlogLevel, msg: string, ...attrs: SlogAttr[]): void {
    if (!this.handler.Enabled(level)) return
    this.handler.Handle({
      level,
      message: msg,
      time: new Date(),
      attrs,
    })
  }

  With(...attrs: SlogAttr[]): SlogLogger {
    return new SlogLogger(this.handler.WithAttrs(attrs))
  }

  WithGroup(name: string): SlogLogger {
    return new SlogLogger(this.handler.WithGroup(name))
  }
}
