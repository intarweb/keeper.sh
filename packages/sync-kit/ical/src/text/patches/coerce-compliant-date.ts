import type { IcsPatch, IcsPatchCoercion } from "../patch";

const coerceCompliantDate: IcsPatch = {
  properties: ["DTSTART", "DTEND", "EXDATE", "RDATE", "RECURRENCE-ID"],
  coerce: (_params: string, _value: string): IcsPatchCoercion | null => {
    throw new Error("unimplemented");
  },
};

export { coerceCompliantDate };
