import { describe, expect, it } from "vitest";
import {
  canonicalizeComparableText,
  containsMarkup,
  htmlToPlainText,
} from "../../../src/core/events/html-text";

const MEET_BLOCK = "s: https://tel.meet/xxx-xxx-xxx?pin=123123123123123&hs=2 "
  + " Learn more about Meet at: https://support.google.com/";

const OUTLOOK_TEXT_BODY = [
  "Join the meeting now",
  "<https://teams.microsoft.com/l/meetup-join/19%3ameeting?context=%7b%22Tid%22%3a%22a%22%7d>",
  "Meeting ID: 123 456 789",
  "For organizers: Meeting options",
  "<https://teams.microsoft.com/meetingOptions/?organizerId=1&tenantId=2>",
].join("\n");

describe("containsMarkup", () => {
  it("does not classify an angle-bracketed bare URL as markup", () => {
    expect(containsMarkup("<https://tel.meet/x?pin=1&hs=2>")).toBe(false);
  });

  it("does not classify the Google Meet description block as markup", () => {
    expect(containsMarkup(MEET_BLOCK)).toBe(false);
  });

  it("does not classify an Outlook plaintext body as markup", () => {
    expect(containsMarkup(OUTLOOK_TEXT_BODY)).toBe(false);
  });

  it("classifies anchors, breaks and block elements as markup", () => {
    expect(containsMarkup("<a href=\"https://x.test\">x</a>")).toBe(true);
    expect(containsMarkup("a<br>b")).toBe(true);
    expect(containsMarkup("<p>a</p>")).toBe(true);
    expect(containsMarkup("<div><span>a</span></div>")).toBe(true);
  });

  it("does not classify an unknown element as markup", () => {
    expect(containsMarkup("<mailto:a@b.test>")).toBe(false);
    expect(containsMarkup("value < 3 and value > 1")).toBe(false);
  });
});

describe("htmlToPlainText", () => {
  it("reads a single-quoted href past a greater-than inside another attribute", () => {
    expect(htmlToPlainText("<a href='https://x.test/a?b=1&amp;c=2' title=\"a>b\"></a>"))
      .toBe("https://x.test/a?b=1&c=2");
  });

  it("keeps a label's destination reachable beside the label", () => {
    expect(htmlToPlainText("<a href='https://x.test/a?b=1&amp;c=2' title=\"a>b\">Link</a>"))
      .toBe("Link (https://x.test/a?b=1&c=2)");
  });

  it("prefers the href when the anchor text is a truncated rendering of it", () => {
    expect(htmlToPlainText(
      "<a href=\"https://tel.meet/xxx-xxx-xxx?pin=1&amp;hs=2\">tel.meet/xxx-xxx-xxx</a>",
    )).toBe("https://tel.meet/xxx-xxx-xxx?pin=1&hs=2");
  });

  it("preserves an angle-bracketed bare URL nested inside real markup", () => {
    expect(htmlToPlainText("<p>see <https://tel.meet/x?pin=1&hs=2></p>").trim())
      .toBe("see <https://tel.meet/x?pin=1&hs=2>");
  });
});

describe("canonicalizeComparableText", () => {
  it("returns an empty string for a missing value", () => {
    expect(canonicalizeComparableText(globalThis.undefined)).toBe("");
  });

  it("decodes named and numeric entities beyond a hand-rolled table", () => {
    expect(canonicalizeComparableText("<p>&mdash; &hellip; &#x27; &#8217; &amp;&nbsp;end</p>"))
      .toBe("— … ' ’ & end");
  });

  it("renders breaks and block elements as line structure", () => {
    expect(canonicalizeComparableText("<div>a</div><div>b</div>")).toBe("a\nb");
    expect(canonicalizeComparableText("a<br>b")).toBe("a\nb");
  });

  it("keeps the Google Meet description block whole, in linkification-free URL form", () => {
    expect(canonicalizeComparableText("<https://tel.meet/x?pin=1&hs=2>"))
      .toBe("<tel.meet/x?pin=1&hs=2>");
    expect(canonicalizeComparableText(MEET_BLOCK)).toBe(
      "s: tel.meet/xxx-xxx-xxx?pin=123123123123123&hs=2"
      + " Learn more about Meet at: support.google.com",
    );
  });

  it("round-trips an Outlook plaintext body apart from URL form", () => {
    expect(canonicalizeComparableText(OUTLOOK_TEXT_BODY))
      .toBe(OUTLOOK_TEXT_BODY.replaceAll("https://", ""));
  });

  it("converges a linkified URL onto the bare URL it was rendered from", () => {
    const bare = "Join: https://tel.meet/abc-def-ghi?pin=99&hs=2";
    const linkified = "Join: <a href=\"https://tel.meet/abc-def-ghi?pin=99&amp;hs=2\">"
      + "https://tel.meet/abc-def-ghi?pin=99&amp;hs=2</a>";

    expect(canonicalizeComparableText(linkified)).toBe(canonicalizeComparableText(bare));
  });

  it("reaches a fixed point", () => {
    const corpus = [
      "<p>a &lt;br&gt; b</p>",
      "&amp;amp;",
      "&amp;lt;p&amp;gt;",
      MEET_BLOCK,
      OUTLOOK_TEXT_BODY,
      "<div><p>one</p><p>two &amp; three</p></div>",
      "<a href=\"https://x.test\">https://x.test</a><br><br>tail",
      "<p>&lt;p&gt;a &lt;br&gt; b&lt;/p&gt;</p>",
      "",
      "   ",
    ];

    for (const value of corpus) {
      const once = canonicalizeComparableText(value);
      expect(canonicalizeComparableText(once)).toBe(once);
    }
  });

  it("never throws on hostile input", () => {
    const inputs = [
      "\uD800",
      "a\uDFFFb",
      "<a href=\"unterminated",
      "<p>",
      "</p>",
      "&#xZZZZ; &#999999999999; &# ; &",
      "<".repeat(4096),
      `${"<div>".repeat(1024)}x${"</div>".repeat(1024)}`,
      "<p>".repeat(2048),
      " ",
    ];

    for (const input of inputs) {
      expect(() => canonicalizeComparableText(input)).not.toThrow();
    }
  });

  it("stays linear enough on a large nested document", () => {
    const paragraph = "<p>lorem &amp; ipsum "
      + "<a href=\"https://x.test/a?b=1\">https://x.test/a?b=1</a></p>";
    const large = `<div>${paragraph.repeat(400)}</div>`;
    const started = performance.now();

    canonicalizeComparableText(large);

    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("is a refinement: equal inputs project equal", () => {
    const corpus = [MEET_BLOCK, OUTLOOK_TEXT_BODY, "<p>a</p>", "plain", ""];

    for (const value of corpus) {
      expect(canonicalizeComparableText(value)).toBe(canonicalizeComparableText(`${value}`));
    }
  });
});
