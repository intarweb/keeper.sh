import { describe, expect, test } from "vitest";
import { parseIcsDocument, unfoldContentLines } from "../../src/index";
import { testLimits, testOptions } from "../support/options";

const maxContentLines = 500;

const foldedInto = (continuations: number): string => {
  const lines = ["BEGIN:VCALENDAR", "DESCRIPTION:start"];
  for (let index = 0; index < continuations; index++) {
    lines.push(" x");
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
};

describe("a single property folded across an unbounded number of continuation lines", () => {
  test("ICAL-L4: more continuations than maxContentLines terminates with a refusal", () => {
    expect(unfoldContentLines(foldedInto(maxContentLines + 1), testLimits({ maxContentLines }))).toEqual(
      { kind: "refused", reason: "limitExceeded" },
    );
  });

  test("ICAL-L4: the document refuses rather than completing the parse", () => {
    expect(
      parseIcsDocument(foldedInto(maxContentLines + 1), testOptions({ limits: { maxContentLines } })),
    ).toEqual({ kind: "unreadable", reason: "limitExceeded" });
  });

  test("ICAL-L4: a body just under the ceiling still unfolds", () => {
    const outcome = unfoldContentLines(foldedInto(10), testLimits({ maxContentLines }));

    expect(outcome.kind).toBe("patched");
    if (outcome.kind !== "patched") {
      return;
    }
    expect(outcome.text).toContain("DESCRIPTION:startxxxxxxxxxx");
  });

  test("ICAL-L4: the unfold is linear in the number of lines, not quadratic", () => {
    const small = performance.now();
    unfoldContentLines(foldedInto(2000), testLimits({ maxContentLines: 100_000 }));
    const smallElapsed = performance.now() - small;

    const large = performance.now();
    unfoldContentLines(foldedInto(20_000), testLimits({ maxContentLines: 100_000 }));
    const largeElapsed = performance.now() - large;

    expect(largeElapsed).toBeLessThan(Math.max(smallElapsed * 40, 500));
  });

  test("ICAL-L4: a body that is small on the wire but folds enormously is still refused", () => {
    const outcome = unfoldContentLines(foldedInto(200_000), testLimits({ maxContentLines }));

    expect(outcome).toEqual({ kind: "refused", reason: "limitExceeded" });
  });
});
