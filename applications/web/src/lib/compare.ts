export interface CompareSource {
  id: string;
  label: string;
  url: string;
  checkedAt: string;
}

export interface CompareRow {
  dimension: string;
  keeper: string;
  rival: string;
  sourceIds?: string[];
}

export interface CompareQuestion {
  question: string;
  answer: string;
}

export const COMPARE_PAGES = [
  {
    path: "/compare/open-source-calendar-sync",
    title: "Open-source calendar sync tools",
    blurb:
      "The self-hostable projects people reach for when they want calendars in sync, sorted by what they actually do. Most of them are CalDAV servers or clients rather than sync tools.",
  },
  {
    path: "/compare/onecal-alternative",
    title: "Keeper.sh vs OneCal",
    blurb:
      "Both mirror events between calendar accounts. OneCal is a hosted product covering Google, Outlook and iCloud; Keeper.sh is AGPL-3.0, self-hostable, and also reads Fastmail, CalDAV and ICS.",
  },
  {
    path: "/compare/calendarbridge-alternative",
    title: "Keeper.sh vs CalendarBridge",
    blurb:
      "CalendarBridge pairs calendar sync with scheduling pages. Keeper.sh does sync only, and gives you the source code, an API, and an MCP server.",
  },
  {
    path: "/compare/reclaim-alternative",
    title: "Keeper.sh vs Reclaim.ai",
    blurb:
      "Reclaim is a scheduling automation product that includes calendar sync. If you want the automation, Keeper.sh is not a replacement. If you only ever wanted the sync, it is.",
  },
] as const;

export type ComparePagePath = (typeof COMPARE_PAGES)[number]["path"];
