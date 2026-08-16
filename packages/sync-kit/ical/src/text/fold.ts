import type { IcsLimits } from "../options";
import type { PatchOutcome } from "./patch";

const foldContentLine = (_line: string): readonly string[] => {
  throw new Error("unimplemented");
};

const unfoldContentLines = (_body: string, _limits: IcsLimits): PatchOutcome => {
  throw new Error("unimplemented");
};

export { foldContentLine, unfoldContentLines };
