import type { IcsPatch, IcsPatchCoercion } from "../patch";

const splitMixedExdate: IcsPatch = {
  properties: ["EXDATE"],
  coerce: (_params: string, _value: string): IcsPatchCoercion | null => {
    throw new Error("unimplemented");
  },
};

export { splitMixedExdate };
