interface PlaceholderEvent {
  id: string;
  startMinutes: number;
  endMinutes: number;
  sourceIndex: number;
}

interface EventTemplate {
  start: number;
  duration: number;
  sourceIndex: number;
}

const HOUR = 60;

const WORK_DAY: EventTemplate[] = [
  { start: 9 * HOUR, duration: 30, sourceIndex: 0 },
  { start: 11 * HOUR, duration: 60, sourceIndex: 0 },
  { start: 14 * HOUR, duration: 90, sourceIndex: 0 },
];

const CONFLICTED_DAY: EventTemplate[] = [
  { start: 9 * HOUR, duration: 30, sourceIndex: 0 },
  { start: 10 * HOUR + 30, duration: 60, sourceIndex: 0 },
  { start: 11 * HOUR, duration: 45, sourceIndex: 1 },
  { start: 15 * HOUR, duration: 60, sourceIndex: 2 },
];

const HEAVILY_CONFLICTED_DAY: EventTemplate[] = [
  { start: 8 * HOUR + 30, duration: 60, sourceIndex: 1 },
  { start: 9 * HOUR, duration: 90, sourceIndex: 0 },
  { start: 9 * HOUR + 30, duration: 30, sourceIndex: 2 },
  { start: 13 * HOUR, duration: 120, sourceIndex: 0 },
  { start: 16 * HOUR, duration: 30, sourceIndex: 1 },
];

const LIGHT_DAY: EventTemplate[] = [
  { start: 10 * HOUR, duration: 60, sourceIndex: 1 },
];

const EVENING_DAY: EventTemplate[] = [
  { start: 8 * HOUR, duration: 45, sourceIndex: 0 },
  { start: 18 * HOUR + 30, duration: 120, sourceIndex: 2 },
];

const PACKED_DAY: EventTemplate[] = [
  { start: 8 * HOUR, duration: 30, sourceIndex: 0 },
  { start: 9 * HOUR, duration: 30, sourceIndex: 0 },
  { start: 10 * HOUR, duration: 60, sourceIndex: 1 },
  { start: 11 * HOUR + 30, duration: 30, sourceIndex: 0 },
  { start: 13 * HOUR, duration: 60, sourceIndex: 0 },
  { start: 14 * HOUR + 30, duration: 30, sourceIndex: 2 },
  { start: 16 * HOUR, duration: 90, sourceIndex: 0 },
];

const WEEKEND_TEMPLATES: EventTemplate[][] = [[], [], LIGHT_DAY, EVENING_DAY];

const WEEKDAY_TEMPLATES: EventTemplate[][] = [
  WORK_DAY,
  CONFLICTED_DAY,
  WORK_DAY,
  HEAVILY_CONFLICTED_DAY,
  LIGHT_DAY,
  PACKED_DAY,
  CONFLICTED_DAY,
];

const hashDate = (date: Date) => {
  const seed = date.getFullYear() * 384 + date.getMonth() * 32 + date.getDate();
  return (seed * 2654435761) >>> 8;
};

const resolveTemplates = (date: Date) => {
  const weekday = date.getDay();
  const hash = hashDate(date);
  if (weekday === 0 || weekday === 6) {
    return WEEKEND_TEMPLATES[hash % WEEKEND_TEMPLATES.length]!;
  }
  return WEEKDAY_TEMPLATES[hash % WEEKDAY_TEMPLATES.length]!;
};

const getPlaceholderEvents = (date: Date): PlaceholderEvent[] => {
  const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  return resolveTemplates(date).map((template, index) => ({
    id: `${dayKey}-${index}`,
    startMinutes: template.start,
    endMinutes: template.start + template.duration,
    sourceIndex: template.sourceIndex,
  }));
};

export type { PlaceholderEvent };
export { getPlaceholderEvents };
