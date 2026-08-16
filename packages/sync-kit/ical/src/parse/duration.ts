import type { OccurrenceDuration } from "@keeper.sh/sync-protocol";

const weekDuration = /^P(\d+)W$/u;
const dayDuration = /^P(\d+)D$/u;
const timeDuration = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u;

const secondsInMinute = 60;
const secondsInHour = 3600;

const parseIcsDuration = (value: string): OccurrenceDuration | null => {
  const weeks = weekDuration.exec(value);
  if (weeks) {
    return { kind: "nominal", days: Number(weeks[1]) * 7 };
  }
  const days = dayDuration.exec(value);
  if (days) {
    return { kind: "nominal", days: Number(days[1]) };
  }
  const time = timeDuration.exec(value);
  if (!time) {
    return null;
  }
  const [, hours, minutes, seconds] = time;
  if (!hours && !minutes && !seconds) {
    return null;
  }
  return {
    kind: "exact",
    seconds: Number(hours ?? 0) * secondsInHour + Number(minutes ?? 0) * secondsInMinute + Number(seconds ?? 0),
  };
};

export { parseIcsDuration };
