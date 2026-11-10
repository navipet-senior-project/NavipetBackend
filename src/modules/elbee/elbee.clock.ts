const WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export interface LaClock {
  day: string;
  weekday: number;
  minutes: number;
}

export function laClock(now: Date): LaClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const weekday = WEEKDAY[read('weekday')];
  if (weekday === undefined) throw new Error('Could not read Los Angeles weekday');
  const hourText = read('hour');
  const hour = hourText === '24' ? 0 : Number(hourText);
  return {
    day: `${read('year')}-${read('month')}-${read('day')}`,
    weekday,
    minutes: hour * 60 + Number(read('minute')),
  };
}
