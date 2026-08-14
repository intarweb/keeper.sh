import { describe, expect, it } from "vitest";
import { canonicalizeComparableText, htmlToPlainText } from "../../../src/core/events/html-text";

const NESTED = "<p>&lt;p&gt;&amp;lt;p&amp;gt;&amp;amp;lt;br&amp;amp;gt;"
  + "&amp;lt;/p&amp;gt;&lt;/p&gt;</p>";

describe("canonicalizeComparableText adversarial", () => {
  it("is idempotent so both sides of a comparison land on the same value", () => {
    const once = canonicalizeComparableText(NESTED);

    expect(canonicalizeComparableText(once)).toBe(once);
  });

  it("agrees with the plain text the CalDAV write path derives from the same source", () => {
    const written = htmlToPlainText(NESTED);

    expect(canonicalizeComparableText(written)).toBe(canonicalizeComparableText(NESTED));
  });

  it("does not erase a description whose content is not itself markup", () => {
    expect(canonicalizeComparableText("<p>&lt;p&gt;Agenda&lt;/p&gt;</p>")).toBe("Agenda");
    expect(canonicalizeComparableText("<p>&lt;p&gt;&amp;lt;br&amp;gt;&lt;/p&gt;</p>"))
      .toBe(canonicalizeComparableText("<br>"));
  });
});

describe("htmlToPlainText adversarial", () => {
  it("keeps document scaffolding out of an Outlook-authored description", () => {
    const outlook = "<html><head><style>p{margin:0}</style></head><body>"
      + "<p>Hi</p><p>Join <a href=\"https://teams.microsoft.com/l/x?a=1&amp;b=2\">"
      + "Click here to join the meeting</a></p></body></html>";

    const plain = htmlToPlainText(outlook);

    expect(plain).not.toContain("<style>");
    expect(plain).not.toContain("<body");
  });
});

describe("unrecognized elements", () => {
  it("does not truncate an unrecognized tag at a '>' inside an attribute value", () => {
    expect(htmlToPlainText("<custom-tag data-x=\"a>b\">kept</custom-tag> tail"))
      .toBe("kept tail");
  });

  it("leaves an angle-bracketed bare URL alone rather than reading it as a tag", () => {
    expect(htmlToPlainText("<p>see <https://tel.meet/x?pin=1&hs=2></p>"))
      .toBe("see <https://tel.meet/x?pin=1&hs=2>");
  });

  it("treats a private-use character the same in markup and in plain text", () => {
    const marker = "\uE000";

    expect(canonicalizeComparableText(`<p>a${marker}b</p>`))
      .toBe(canonicalizeComparableText(`a${marker}b`));
  });
});
