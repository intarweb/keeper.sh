import type { ProviderDecorator } from "./decorate";

const expiringCursorAfter = (pages: number): ProviderDecorator => {
  throw new Error(`unimplemented: expiringCursorAfter(${pages})`);
};

export { expiringCursorAfter };
