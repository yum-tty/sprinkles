/**
 * Formats a Date according to the given format string.
 * Tokens: YYYY, MM, DD, HH, mm, ss.
 */
export function formatTime(date: Date, timeFormat: string): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return timeFormat
    .replaceAll("YYYY", String(date.getFullYear()))
    .replaceAll("MM", pad(date.getMonth() + 1))
    .replaceAll("DD", pad(date.getDate()))
    .replaceAll("HH", pad(date.getHours()))
    .replaceAll("mm", pad(date.getMinutes()))
    .replaceAll("ss", pad(date.getSeconds()))
}
