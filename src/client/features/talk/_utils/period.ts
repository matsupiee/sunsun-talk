import { PERIODS, type Period } from "./constants";

export function getPeriod(date = new Date()): Period {
  const hour = date.getHours();
  return (
    PERIODS.find((period) => {
      if (period.from <= period.to) {
        return hour >= period.from && hour <= period.to;
      }
      return hour >= period.from || hour <= period.to;
    }) ?? PERIODS[1]
  );
}
