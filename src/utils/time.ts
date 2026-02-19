const BRASILIA_TIMEZONE = "America/Sao_Paulo";

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
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
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
