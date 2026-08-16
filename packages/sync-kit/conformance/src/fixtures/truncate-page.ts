import type { ProviderDecorator } from "./decorate";

const truncatingAfter = (events: number): ProviderDecorator => {
  throw new Error(`unimplemented: truncatingAfter(${events})`);
};

export { truncatingAfter };
