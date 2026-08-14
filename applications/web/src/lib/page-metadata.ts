const monthYearFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatMonthYear(isoDate: string): string {
  return monthYearFormatter.format(new Date(isoDate));
}

export interface PageMetadata {
  path: string;
  updatedAt: string;
}

const STATIC_PAGE_UPDATED_AT = {
  "/": "2026-08-11",
  "/features": "2026-08-11",
  "/pricing": "2026-08-11",
  "/docs/mcp": "2026-08-14",
  "/privacy": "2025-12-01",
  "/terms": "2025-12-01",
} as const satisfies Record<string, string>;

export type StaticPagePath = keyof typeof STATIC_PAGE_UPDATED_AT;

export const staticPageMetadata: PageMetadata[] = Object.entries(
  STATIC_PAGE_UPDATED_AT,
).map(([path, updatedAt]) => ({ path, updatedAt }));

export function pageUpdatedAt(path: StaticPagePath): string {
  return STATIC_PAGE_UPDATED_AT[path];
}
