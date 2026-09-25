const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

/** ISO instant for local midnight of "today" in the given IANA timezone. */
export function startOfDayIso(timezone: string = DEFAULT_TZ, reference: Date = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);

  const offset = offsetMinutesFor(timezone, reference);
  const utc = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10))
  );
  return new Date(utc - offset * 60_000).toISOString();
}

function offsetMinutesFor(timezone: string, reference: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(reference);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return Math.round((asUtc - reference.getTime()) / 60_000);
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: DEFAULT_TZ,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_TZ,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function minutesSince(value: string | Date): number {
  const time = typeof value === "string" ? Date.parse(value) : value.getTime();
  return Math.max(0, Math.floor((Date.now() - time) / 60_000));
}
