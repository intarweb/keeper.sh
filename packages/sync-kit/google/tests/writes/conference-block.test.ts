import { describe, expect, test } from "vitest";
import { projectDescription } from "../../src/write/normalize";

const conferenceBlock = [
  "Join the meeting",
  "-::~:~::~:~:~:~:~:~:~:~:~:~::~:~::-",
  "Join with Google Meet: https://meet.google.com/abc-defg-hij",
  "-::~:~::~:~:~:~:~:~:~:~:~:~::~:~::-",
  "Bring the agenda",
].join("\n");

const escapedMarkup = "the config sets &lt;timeout&gt;30&lt;/timeout&gt; on purpose";

describe("a provider-owned region is projected exactly once", () => {
  test("GOOG-O20: projecting a description twice equals projecting it once and preserves escaped markup", () => {
    const once = projectDescription(conferenceBlock);
    const twice = projectDescription(once);

    expect(twice).toBe(once);
    expect(projectDescription(escapedMarkup)).toBe(escapedMarkup);
  });

  test("GOOG-O20: the whole conference region goes, not just its delimiters", () => {
    const projected = projectDescription(conferenceBlock);

    expect(projected).not.toContain("meet.google.com");
    expect(projected).toContain("Bring the agenda");
  });

  test("GOOG-O20: a description that owns no provider region is untouched", () => {
    expect(projectDescription("just an ordinary description")).toBe("just an ordinary description");
    expect(projectDescription(null)).toBeNull();
  });
});
