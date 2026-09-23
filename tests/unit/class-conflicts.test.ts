import { describe, expect, it } from 'vitest';

import {
  findClassConflicts,
  findDuplicateClass,
  formatClockTime,
  secondsFromMidnight,
  type ClassSchedule,
} from '../../src/modules/classes/class-conflicts.js';
import type { ClassRecord } from '../../src/modules/classes/classes.types.js';

function existing(overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    courseCode: 'CECS 274',
    courseName: 'Data Structures',
    building: 'Vivian Engineering Center',
    room: '3-3',
    weekdays: [2, 4],
    startTime: '09:00:00',
    endTime: '10:00:00',
    latitude: 33.783,
    longitude: -118.112,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function candidate(overrides: Partial<ClassSchedule> = {}): ClassSchedule {
  return { courseCode: 'CECS 323', weekdays: [2, 4], startTime: '09:00', endTime: '10:00', ...overrides };
}

describe('secondsFromMidnight / formatClockTime', () => {
  it.each([
    ['00:00', 0],
    ['08:50', 8 * 3600 + 50 * 60],
    ['16:45:30', 16 * 3600 + 45 * 60 + 30],
  ])('%s -> %i', (time, seconds) => {
    expect(secondsFromMidnight(time)).toBe(seconds);
  });

  it.each([
    ['00:05', '12:05 AM'],
    ['08:00', '8:00 AM'],
    ['12:30:00', '12:30 PM'],
    ['18:45', '6:45 PM'],
  ])('%s -> %s', (time, label) => {
    expect(formatClockTime(time)).toBe(label);
  });
});

describe('findClassConflicts', () => {
  it('flags an exact overlap on every shared weekday', () => {
    expect(findClassConflicts(candidate(), [existing()])).toEqual([
      {
        existingClassId: existing().id,
        existingCourse: 'CECS 274',
        day: 'Tu',
        newTime: '9:00 AM-10:00 AM',
        existingTime: '9:00 AM-10:00 AM',
        location: 'Vivian Engineering Center 3-3',
      },
      expect.objectContaining({ day: 'Th' }),
    ]);
  });

  it('flags a partial overlap', () => {
    const conflicts = findClassConflicts(candidate({ startTime: '09:30', endTime: '10:30' }), [existing()]);
    expect(conflicts).toHaveLength(2);
  });

  it('flags one class fully containing another, in both directions', () => {
    const inner = candidate({ startTime: '09:15', endTime: '09:45' });
    const outer = candidate({ startTime: '08:00', endTime: '11:00' });
    expect(findClassConflicts(inner, [existing()])).toHaveLength(2);
    expect(findClassConflicts(outer, [existing()])).toHaveLength(2);
  });

  it('allows back-to-back classes on either side', () => {
    expect(findClassConflicts(candidate({ startTime: '10:00', endTime: '11:00' }), [existing()])).toEqual([]);
    expect(findClassConflicts(candidate({ startTime: '08:00', endTime: '09:00' }), [existing()])).toEqual([]);
  });

  it('flags a one-minute overlap (9:59 start against a 10:00 end)', () => {
    expect(findClassConflicts(candidate({ startTime: '09:59', endTime: '11:00' }), [existing()])).toHaveLength(2);
  });

  it('ignores overlapping times on different weekdays', () => {
    expect(findClassConflicts(candidate({ weekdays: [1, 3, 5] }), [existing()])).toEqual([]);
  });

  it('reports only the shared weekdays', () => {
    const conflicts = findClassConflicts(candidate({ weekdays: [1, 4] }), [existing()]);
    expect(conflicts.map((conflict) => conflict.day)).toEqual(['Th']);
  });

  it('never conflicts an asynchronous class (no weekdays), either as candidate or existing', () => {
    expect(findClassConflicts(candidate({ weekdays: [] }), [existing()])).toEqual([]);
    expect(findClassConflicts(candidate(), [existing({ weekdays: [] })])).toEqual([]);
  });

  it('checks against every existing class and reports each conflict', () => {
    const lecture = existing({ id: '00000000-0000-4000-8000-0000000000e2', weekdays: [1, 3], startTime: '09:00', endTime: '09:50' });
    const lab = existing({ id: '00000000-0000-4000-8000-0000000000e3', weekdays: [5], startTime: '09:00', endTime: '11:45', room: '' });
    const conflicts = findClassConflicts(candidate({ weekdays: [1, 5] }), [lecture, lab]);
    expect(conflicts).toEqual([
      expect.objectContaining({ existingClassId: lecture.id, day: 'M' }),
      expect.objectContaining({ existingClassId: lab.id, day: 'F', location: 'Vivian Engineering Center' }),
    ]);
  });

  it('treats evening and off-grid times like any other interval', () => {
    const evening = existing({ startTime: '19:00', endTime: '21:45' });
    expect(findClassConflicts(candidate({ startTime: '21:40', endTime: '22:10' }), [evening])).toEqual([
      expect.objectContaining({ newTime: '9:40 PM-10:10 PM', existingTime: '7:00 PM-9:45 PM' }),
      expect.objectContaining({ day: 'Th' }),
    ]);
  });

  it('compares stored HH:MM:SS values against HH:MM input', () => {
    expect(findClassConflicts(candidate({ startTime: '10:00:00', endTime: '11:00:00' }), [existing()])).toEqual([]);
  });

  it('skips the class being edited', () => {
    expect(findClassConflicts(candidate(), [existing()], existing().id)).toEqual([]);
  });
});

describe('findDuplicateClass', () => {
  it('matches the same course code and schedule regardless of case, spacing, or weekday order', () => {
    const duplicate = findDuplicateClass(
      candidate({ courseCode: ' cecs  274 ', weekdays: [4, 2], startTime: '09:00', endTime: '10:00' }),
      [existing()],
    );
    expect(duplicate?.id).toBe(existing().id);
  });

  it('matches a duplicate asynchronous class', () => {
    const asyncClass = existing({ weekdays: [] });
    expect(findDuplicateClass(candidate({ courseCode: 'CECS 274', weekdays: [] }), [asyncClass])).toBe(asyncClass);
  });

  it('does not treat another component of the same course (e.g. its lab) as a duplicate', () => {
    expect(findDuplicateClass(candidate({ courseCode: 'CECS 274', weekdays: [5] }), [existing()])).toBeUndefined();
    expect(findDuplicateClass(candidate({ courseCode: 'CECS 274', endTime: '10:15' }), [existing()])).toBeUndefined();
  });

  it('skips the class being edited', () => {
    expect(findDuplicateClass(candidate({ courseCode: 'CECS 274' }), [existing()], existing().id)).toBeUndefined();
  });
});
