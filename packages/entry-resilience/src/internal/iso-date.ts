const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Strict ISO 8601 UTC parse: exactly `YYYY-MM-DDTHH:mm:ssZ`, with every field range-checked (including
 * leap years). `Date.parse` accepts many non-conformant formats and silently rolls over out-of-range
 * fields instead of rejecting them, so it is never used here. Returns epoch milliseconds, or `undefined`
 * when `value` is not in this exact form.
 */
export function parseStrictIsoUtc(value: string): number | undefined {
  const match = ISO_UTC.exec(value);
  if (!match) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  if (!yearText || !monthText || !dayText || !hourText || !minuteText || !secondText) return undefined;

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  // Below the Unix epoch's year is out of range for this contract: every manifest/key timestamp this package
  // compares is epoch-relative, so a pre-1970 year could otherwise parse to a negative-but-finite value that
  // silently satisfies every ordering check it is compared against (independent review finding, 2026-09-17).
  if (year < 1970) return undefined;
  if (month < 1 || month > 12) return undefined;
  const daysInMonth = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (daysInMonth === undefined || day < 1 || day > daysInMonth) return undefined;
  if (hour > 23 || minute > 59 || second > 59) return undefined;

  return Date.UTC(year, month - 1, day, hour, minute, second);
}
