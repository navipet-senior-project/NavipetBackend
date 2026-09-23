import type { ClassRecord } from './classes.types.js';

/** CSULB schedule day labels, indexed by ISO weekday (1 = Monday ... 7 = Sunday). */
const DAY_LABELS = ['', 'M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'] as const;

export interface ClassSchedule {
  courseCode: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
}

export interface ClassConflict {
  existingClassId: string;
  existingCourse: string;
  day: string;
  newTime: string;
  existingTime: string;
  location: string;
}

/** Seconds from midnight for a "HH:MM" or "HH:MM:SS" 24-hour time. */
export function secondsFromMidnight(time: string): number {
  const [hours = 0, minutes = 0, seconds = 0] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

/** "16:45" -> "4:45 PM". */
export function formatClockTime(time: string): string {
  const minutesOfDay = Math.floor(secondsFromMidnight(time) / 60);
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour12)}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

function formatRange(schedule: ClassSchedule): string {
  return `${formatClockTime(schedule.startTime)}-${formatClockTime(schedule.endTime)}`;
}

function normalizeCourseCode(courseCode: string): string {
  return courseCode.replace(/\s+/g, ' ').trim().toLocaleUpperCase('en-US');
}

/**
 * Half-open interval overlap: a class ending at 10:00 and one starting at
 * 10:00 do not conflict, but one starting at 9:59 does.
 */
function timesOverlap(a: ClassSchedule, b: ClassSchedule): boolean {
  return secondsFromMidnight(a.startTime) < secondsFromMidnight(b.endTime) &&
    secondsFromMidnight(a.endTime) > secondsFromMidnight(b.startTime);
}

/**
 * Every (existing class, shared weekday) pair whose scheduled time overlaps
 * the candidate. A class with no weekdays is asynchronous and never conflicts.
 * `ignoreClassId` excludes the class being edited from its own check.
 */
export function findClassConflicts(
  candidate: ClassSchedule,
  existing: readonly ClassRecord[],
  ignoreClassId?: string,
): ClassConflict[] {
  const candidateDays = new Set(candidate.weekdays);
  const conflicts: ClassConflict[] = [];
  for (const other of existing) {
    if (other.id === ignoreClassId || !timesOverlap(candidate, other)) continue;
    for (const day of [...new Set(other.weekdays)].sort((a, b) => a - b)) {
      if (!candidateDays.has(day)) continue;
      conflicts.push({
        existingClassId: other.id,
        existingCourse: other.courseCode,
        day: DAY_LABELS[day] ?? String(day),
        newTime: formatRange(candidate),
        existingTime: formatRange(other),
        location: other.room === '' ? other.building : `${other.building} ${other.room}`,
      });
    }
  }
  return conflicts;
}

/**
 * An existing class with the same course code and the same schedule (same
 * weekday set, same start and end) is the same class added twice.
 */
export function findDuplicateClass(
  candidate: ClassSchedule,
  existing: readonly ClassRecord[],
  ignoreClassId?: string,
): ClassRecord | undefined {
  const code = normalizeCourseCode(candidate.courseCode);
  const days = [...new Set(candidate.weekdays)].sort((a, b) => a - b).join(',');
  return existing.find((other) =>
    other.id !== ignoreClassId &&
    normalizeCourseCode(other.courseCode) === code &&
    [...new Set(other.weekdays)].sort((a, b) => a - b).join(',') === days &&
    secondsFromMidnight(other.startTime) === secondsFromMidnight(candidate.startTime) &&
    secondsFromMidnight(other.endTime) === secondsFromMidnight(candidate.endTime),
  );
}
