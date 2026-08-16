import type { IcsLimits } from "../options";

interface DeclaredZone {
  readonly declaredId: string;
  readonly observances: "projected" | "explicit";
  readonly offsets: readonly number[];
}

const readDeclaredZones = (_body: string, _limits: IcsLimits): readonly DeclaredZone[] => {
  throw new Error("unimplemented");
};

export { readDeclaredZones };
export type { DeclaredZone };
