import type { PlannedWrite } from "./plan";

const comparePlannedWrites = (left: PlannedWrite, right: PlannedWrite): number => {
  throw new Error(`unimplemented: comparePlannedWrites(${left.kind}, ${right.kind})`);
};

export { comparePlannedWrites };
