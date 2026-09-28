// Local wall-clock timestamps that keep their timezone offset.
//
// TPL records the local time at the moment of the action together with the
// explicit numeric offset, e.g. "2026-09-28T18:05:00.123+08:00". This is
// lossless: the recorded wall clock is preserved and the instant is still
// unambiguous. Readers that only care about the wall clock (e.g. the DAC
// event log) strip the offset.

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/;
const NUMERIC_OFFSET_SUFFIX = /[+-]\d{2}:?\d{2}$/;

// "2026-09-28T18:05:00.123+08:00" from a Date (defaults to now).
export function nowLocalISOWithOffset(date: Date = new Date()): string {
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  const offsetMin = -date.getTimezoneOffset(); // minutes east of UTC
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// Drop the timezone designator, keeping the recorded wall clock.
// Numeric offsets are already in the recorded local time; a UTC (Z) value is
// converted to the reader's local time as a best effort for legacy data.
export function toLocalNaiveISO(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim();
  if (NUMERIC_OFFSET_SUFFIX.test(v)) return v.replace(NUMERIC_OFFSET_SUFFIX, "");
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.replace(OFFSET_SUFFIX, "");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
