import { microsoftLimits } from "../limits";

const microsoftPrefer = [
  'outlook.timezone="UTC"',
  'outlook.body-content-type="text"',
  `odata.maxpagesize=${microsoftLimits.pageSize}`,
] as const;

type PreferDirective = (typeof microsoftPrefer)[number];

const preferHeaderValue = (): string => microsoftPrefer.join(", ");

export { microsoftPrefer, preferHeaderValue };
export type { PreferDirective };
