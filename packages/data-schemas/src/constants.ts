const SYNC_RANGE_DEFINITIONS = [
  { label: "1 Week", shift: { amount: 7, unit: "days" }, value: "1_week" },
  { label: "1 Month", shift: { amount: 1, unit: "months" }, value: "1_month" },
  { label: "3 Months", shift: { amount: 3, unit: "months" }, value: "3_months" },
  { label: "6 Months", shift: { amount: 6, unit: "months" }, value: "6_months" },
  { label: "12 Months", shift: { amount: 12, unit: "months" }, value: "12_months" },
  { label: "2 Years", shift: { amount: 24, unit: "months" }, value: "2_years" },
] as const;

const DEFAULT_HISTORIC_SYNC_RANGE = "1_month" as const;
const DEFAULT_FUTURE_SYNC_RANGE = "2_years" as const;

const DEFAULT_FEED_SETTINGS = {
  includeEventName: false,
  includeEventDescription: false,
  includeEventLocation: false,
  excludeAllDayEvents: false,
  excludeFocusTime: false,
  excludeOutOfOffice: false,
  customEventName: "Busy",
} as const;

const DEFAULT_FEED_NAME = "My Calendar" as const;

const DEFAULT_SOURCE_SYNC_RULES = {
  customEventName: "{{calendar_name}}",
  excludeEventDescription: true,
  excludeEventLocation: true,
  excludeEventName: true,
  includeInIcalFeed: true,
} as const;

const applySourceSyncDefaults = <TValues extends object>(
  values: TValues,
): TValues & typeof DEFAULT_SOURCE_SYNC_RULES => ({
  ...DEFAULT_SOURCE_SYNC_RULES,
  ...values,
});

export {
  DEFAULT_FEED_NAME,
  DEFAULT_FEED_SETTINGS,
  DEFAULT_FUTURE_SYNC_RANGE,
  DEFAULT_HISTORIC_SYNC_RANGE,
  DEFAULT_SOURCE_SYNC_RULES,
  SYNC_RANGE_DEFINITIONS,
  applySourceSyncDefaults,
};
