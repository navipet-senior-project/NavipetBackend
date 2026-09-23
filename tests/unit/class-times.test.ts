import { describe, expect, it } from 'vitest';

import { parseClockTime, parseCsulbTimeRange } from '../../src/modules/classes/class-times.js';

describe('parseClockTime', () => {
  it.each([
    ['08:00', '08:00'],
    ['16:45', '16:45'],
    ['16:45:30', '16:45:30'],
    ['8AM', '08:00'],
    ['8 am', '08:00'],
    ['4:45PM', '16:45'],
    ['4:45 pm', '16:45'],
    ['12:30 PM', '12:30'],
    ['12 AM', '00:00'],
    ['12:15am', '00:15'],
    ['11:59 PM', '23:59'],
  ])('%s -> %s', (input, expected) => {
    expect(parseClockTime(input)).toBe(expected);
  });

  it.each(['8:00', '24:00', '13PM', '0:30 AM', '4:60 PM', '4:45 P', 'noon', ''])('rejects %j', (input) => {
    expect(parseClockTime(input)).toBeNull();
  });
});

describe('parseCsulbTimeRange', () => {
  it.each([
    ['8-8:50AM', '08:00', '08:50'],
    ['12:30-3:15PM', '12:30', '15:15'],
    ['4-6:45PM', '16:00', '18:45'],
    ['7-9:45PM', '19:00', '21:45'],
    ['11-12:15PM', '11:00', '12:15'],
    ['9:30-12:15PM', '09:30', '12:15'],
    ['12-12:50PM', '12:00', '12:50'],
    ['10:30AM-1:15PM', '10:30', '13:15'],
    ['8:00 AM - 9:15 AM', '08:00', '09:15'],
    ['4 - 6:45 pm', '16:00', '18:45'],
    ['4–6:45PM', '16:00', '18:45'],
    ['16:00-18:45', '16:00', '18:45'],
  ])('%s -> %s-%s', (input, startTime, endTime) => {
    expect(parseCsulbTimeRange(input)).toEqual({ kind: 'scheduled', startTime, endTime });
  });

  it.each(['NA/NA', 'na / na', 'NA', 'TBA'])('treats %j as unscheduled', (input) => {
    expect(parseCsulbTimeRange(input)).toEqual({ kind: 'unscheduled' });
  });

  it.each([
    ['no separator', '4PM'],
    ['too many parts', '4-5-6PM'],
    ['no AM/PM anywhere', '8-8:50'],
    ['24-hour start with 12-hour end', '13:00-3:15PM'],
    ['12-hour start with 24-hour end', '8AM-09:15'],
    ['end before start', '3PM-1PM'],
    ['zero-length', '4PM-4PM'],
    ['would cross midnight', '11-1AM'],
    ['garbage', 'sometime-later'],
  ])('rejects %s (%j)', (_label, input) => {
    expect(parseCsulbTimeRange(input)).toBeNull();
  });
});
