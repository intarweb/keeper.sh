import { useSyncExternalStore } from "react";

const MS_PER_DAY = 86_400_000;
const REFRESH_INTERVAL_MS = 60_000;

const resolveDayFraction = () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (now.getTime() - startOfDay.getTime()) / MS_PER_DAY;
};

let snapshot: number | null = null;

const getSnapshot = () => {
  snapshot = snapshot ?? resolveDayFraction();
  return snapshot;
};

const getServerSnapshot = (): number | null => null;

const subscribe = (onStoreChange: () => void) => {
  const interval = setInterval(() => {
    snapshot = resolveDayFraction();
    onStoreChange();
  }, REFRESH_INTERVAL_MS);
  return () => clearInterval(interval);
};

const useDayFraction = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export { useDayFraction };
