const windowsZones = {} as const satisfies Record<string, string>;

type WindowsZoneName = keyof typeof windowsZones;

export { windowsZones };
export type { WindowsZoneName };
