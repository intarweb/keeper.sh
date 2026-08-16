import { describe, expect, test } from "vitest";
import { assertNever } from "../src/index";

type StoredVariant =
  | { readonly kind: "mirrored"; readonly id: string }
  | { readonly kind: "retired"; readonly id: string };

const classify = (variant: StoredVariant): string => {
  switch (variant.kind) {
    case "mirrored": {
      return `mirrored:${variant.id}`;
    }
    case "retired": {
      return `retired:${variant.id}`;
    }
    default: {
      return assertNever(variant);
    }
  }
};

const unhandledVariant: StoredVariant = JSON.parse('{"kind":"impossible","id":"evt-1"}');

const withDeadline = (operation: () => Promise<string>, budgetMs: number): Promise<string> => {
  const deadline = new Promise<string>((_resolve, reject) => {
    setTimeout(() => reject(new Error("deadline exceeded")), budgetMs);
  });
  return Promise.race([operation(), deadline]);
};

describe("assertNever", () => {
  test("throws instead of returning, and names the variant nobody handled", () => {
    expect(() => classify(unhandledVariant)).toThrow(/impossible/);
  });

  test("carries the whole offending value so the wide event can identify it", () => {
    expect(() => classify(unhandledVariant)).toThrow(/"id":"evt-1"/);
  });

  test("rejects the enclosing operation rather than letting a tick complete having done nothing", async () => {
    const tick = async (): Promise<string> => {
      await Promise.resolve();
      return classify(unhandledVariant);
    };
    await expect(withDeadline(tick, 50)).rejects.toThrow(/impossible/);
  });
});
