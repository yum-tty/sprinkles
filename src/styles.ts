import { Style } from "caramel"
import { Level, DebugLevel, InfoLevel, WarnLevel, ErrorLevel, FatalLevel } from "./level"

export interface Styles {
  Timestamp: Style
  Caller: Style
  Prefix: Style
  Message: Style
  Key: Style
  Value: Style
  Separator: Style
  Levels: Record<number, Style>
  KeyOverrides: Record<string, Style>
  ValueOverrides: Record<string, Style>
  OutputKeys: { timestamp: string; message: string; level: string; caller: string; prefix: string }
  SeparatorChar: string
  IndentChar: string
  MultilineIndent: string
  TimeFormat: string
  CallerWrapIn: string
  CallerWrapOut: string
  CallerSegments: number
  PrettyJSON: boolean
}

function defaultLevelStyles(): Record<number, Style> {
  return {
    [DebugLevel]: Style.newStyle()
      .setString("DEBUG")
      .bold(true)
      .maxWidth(4)
      .foreground("63"),
    [InfoLevel]: Style.newStyle()
      .setString("INFO")
      .bold(true)
      .maxWidth(4)
      .foreground("86"),
    [WarnLevel]: Style.newStyle()
      .setString("WARN")
      .bold(true)
      .maxWidth(4)
      .foreground("192"),
    [ErrorLevel]: Style.newStyle()
      .setString("ERROR")
      .bold(true)
      .maxWidth(4)
      .foreground("204"),
    [FatalLevel]: Style.newStyle()
      .setString("FATAL")
      .bold(true)
      .maxWidth(4)
      .foreground("134"),
  }
}

export function DefaultStyles(): Styles {
  return {
    Timestamp: Style.newStyle(),
    Caller: Style.newStyle().faint(true),
    Prefix: Style.newStyle().bold(true).faint(true),
    Message: Style.newStyle(),
    Key: Style.newStyle().faint(true),
    Value: Style.newStyle(),
    Separator: Style.newStyle().faint(true),
    Levels: defaultLevelStyles(),
    KeyOverrides: {},
    ValueOverrides: {},
    OutputKeys: { timestamp: "time", message: "msg", level: "level", caller: "caller", prefix: "prefix" },
    SeparatorChar: "=",
    IndentChar: "  │ ",
    MultilineIndent: "  ",
    TimeFormat: "YYYY/MM/DD HH:mm:ss",
    CallerWrapIn: "<",
    CallerWrapOut: ">",
    CallerSegments: 2,
    PrettyJSON: false,
  }
}

export function cloneStyles(s: Styles): Styles {
  return {
    Timestamp: s.Timestamp.copy(),
    Caller: s.Caller.copy(),
    Prefix: s.Prefix.copy(),
    Message: s.Message.copy(),
    Key: s.Key.copy(),
    Value: s.Value.copy(),
    Separator: s.Separator.copy(),
    Levels: { ...s.Levels },
    KeyOverrides: { ...s.KeyOverrides },
    ValueOverrides: { ...s.ValueOverrides },
    OutputKeys: { ...s.OutputKeys },
    SeparatorChar: s.SeparatorChar,
    IndentChar: s.IndentChar,
    MultilineIndent: s.MultilineIndent,
    TimeFormat: s.TimeFormat,
    CallerWrapIn: s.CallerWrapIn,
    CallerWrapOut: s.CallerWrapOut,
    CallerSegments: s.CallerSegments,
    PrettyJSON: s.PrettyJSON,
  }
}
