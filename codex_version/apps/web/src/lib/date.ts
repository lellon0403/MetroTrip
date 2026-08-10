export function dateInSeoul(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function addCalendarDays(value: string, amount: number): string {
  const [yearText, monthText, dayText] = value.split("-");
  if (!yearText || !monthText || !dayText) {
    throw new Error(`올바르지 않은 달력 날짜입니다: ${value}`);
  }
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
