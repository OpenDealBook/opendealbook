export const LOOK_BACK_YEARS = 10;

export function yearsBefore(date: Date, years: number): Date {
  const earlier = new Date(date);
  earlier.setUTCFullYear(earlier.getUTCFullYear() - years);
  return earlier;
}
