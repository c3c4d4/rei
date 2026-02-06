export function now(): string {
  return new Date().toISOString();
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isBefore(a: string, b: string): boolean {
  return new Date(a).getTime() < new Date(b).getTime();
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

export function msUntil(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

export function formatShort(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function calculateDeadlines(
  startDate: Date,
  config: {
    cycleDurationDays: number;
    declarationDeadlineHours: number;
    reviewPeriodHours: number;
  }
) {
  const declarationDeadline = addHours(startDate, config.declarationDeadlineHours);
  const reviewDeadline = addDays(startDate, config.cycleDurationDays);
  const productionDeadline = addHours(reviewDeadline, -config.reviewPeriodHours);

  return {
    declarationDeadline: declarationDeadline.toISOString(),
    productionDeadline: productionDeadline.toISOString(),
    reviewDeadline: reviewDeadline.toISOString(),
  };
}
