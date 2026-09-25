export function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value.length > 0 ? value[0] : null) : value;
}
