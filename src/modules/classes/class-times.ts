/**
 * Clock-time parsing for class schedules. Everything is normalized to the
 * 24-hour "HH:MM" (or "HH:MM:SS") form the database stores.
 *
 * Accepted single times:
 *   24-hour  "08:00", "16:45", "16:45:30"   (two-digit hour, so "8:00" is rejected as ambiguous)
 *   12-hour  "8AM", "8 am", "4:45PM", "12:30 pm"
 *
 * Accepted CSULB schedule ranges (the "Time" column of the class schedule):
 *   "8-8:50AM", "12:30-3:15PM", "4-6:45PM", "7-9:45PM", "10:30AM-1:15PM",
 *   "8:00 AM - 9:15 AM", "16:00-18:45", and "NA/NA" / "TBA" for no scheduled time.
 */

import { secondsFromMidnight } from './class-conflicts.js';

const TWENTY_FOUR_HOUR = /^([01][0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;
const TWELVE_HOUR = /^(0?[1-9]|1[0-2])(?::([0-5][0-9]))?\s*([AP])M$/i;
const BARE_HOUR = /^(0?[1-9]|1[0-2])(?::([0-5][0-9]))?$/;
const UNSCHEDULED = /^(NA\s*\/\s*NA|NA|TBA)$/i;
const RANGE_SEPARATOR = /\s*[-–—]\s*/;

type Meridiem = 'A' | 'P';

export type ParsedTimeRange =
  | { kind: 'scheduled'; startTime: string; endTime: string }
  | { kind: 'unscheduled' };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function fromTwelveHour(hour: number, minute: number, meridiem: Meridiem): string {
  const hour24 = (hour % 12) + (meridiem === 'P' ? 12 : 0);
  return `${pad(hour24)}:${pad(minute)}`;
}

function toMeridiem(value: string): Meridiem {
  return value.toUpperCase() === 'P' ? 'P' : 'A';
}

/** "4:45 PM" -> "16:45"; "16:45" -> "16:45"; anything else -> null. */
export function parseClockTime(value: string): string | null {
  const text = value.trim();
  const twentyFour = TWENTY_FOUR_HOUR.exec(text);
  if (twentyFour !== null) return text;
  const twelve = TWELVE_HOUR.exec(text);
  if (twelve === null) return null;
  const [, hour = '', minute = '0', meridiem = 'A'] = twelve;
  return fromTwelveHour(Number(hour), Number(minute), toMeridiem(meridiem));
}

function meridiemOf(value: string): Meridiem | null {
  const twelve = TWELVE_HOUR.exec(value.trim());
  return twelve === null ? null : toMeridiem(twelve[3] ?? 'A');
}

/**
 * A CSULB range usually writes AM/PM once, after the end time. The start
 * inherits it unless that would put the start at or after the end, in which
 * case the range crosses noon ("11-12:15PM" is 11:00 AM to 12:15 PM).
 * Returns null for anything unparseable or ambiguous.
 */
export function parseCsulbTimeRange(value: string): ParsedTimeRange | null {
  const text = value.trim();
  if (UNSCHEDULED.test(text)) return { kind: 'unscheduled' };

  const parts = text.split(RANGE_SEPARATOR);
  if (parts.length !== 2) return null;
  const [startText = '', endText = ''] = parts;

  const endTime = parseClockTime(endText);
  if (endTime === null) return null;
  const endMeridiem = meridiemOf(endText);

  let startTime = parseClockTime(startText);
  if (startTime === null) {
    const bare = BARE_HOUR.exec(startText.trim());
    // A bare start ("4" in "4-6:45PM") needs the end's AM/PM to mean anything.
    if (bare === null || endMeridiem === null) return null;
    const hour = Number(bare[1]);
    const minute = Number(bare[2] ?? '0');
    startTime = fromTwelveHour(hour, minute, endMeridiem);
    if (secondsFromMidnight(startTime) >= secondsFromMidnight(endTime) && endMeridiem === 'P') startTime = fromTwelveHour(hour, minute, 'A');
  } else if ((meridiemOf(startText) === null) !== (endMeridiem === null)) {
    // Mixing a 24-hour start with a 12-hour end (or vice versa) is ambiguous.
    return null;
  }

  return secondsFromMidnight(startTime) < secondsFromMidnight(endTime) ? { kind: 'scheduled', startTime, endTime } : null;
}
