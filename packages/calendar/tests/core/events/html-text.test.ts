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

const NESTED = "<p>&lt;p&gt;&amp;lt;p&amp;gt;&amp;amp;lt;br&amp;amp;gt;"
  + "&amp;lt;/p&amp;gt;&lt;/p&gt;</p>";

const PRETTY_OUTLOOK_BODY = `<html>
<head><meta charset="utf-8"></head>
<body>
  <p>Quarterly planning sync.</p>
  <p>Join the meeting now</p>
</body>
</html>`;

const COMPACT_ECHO =
  "<html><head><meta charset=\"utf-8\"></head><body>"
  + "<p>Quarterly planning sync.</p><p>Join the meeting now</p></body></html>";

const escapeOnce = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeTimes = (value: string, times: number): string => {
  if (times === 0) {
    return value;
  }

  return escapeTimes(escapeOnce(value), times - 1);
};

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

  it("returns prose that names elements exactly as it was written", () => {
    const corpus = [
      "Set the <input> field before you arrive",
      "Bring the <source> document and the <link> handout",
      "Grade a<b or better</blockquote>",
      "<p>Agenda item one<p>Agenda item two",
      "value < 3 and value > 1",
      MEET_BLOCK,
      OUTLOOK_TEXT_BODY,
    ];

    for (const value of corpus) {
      expect(htmlToPlainText(value)).toBe(value);
    }
  });

  it("keeps every word when an attribute quote is never terminated", () => {
    const truncated = "<p>Agenda</p><p>Join <a href=\"https://x.test/j>here</a> at noon</p>"
      + "<p>Bye</p>";
    const written = htmlToPlainText(truncated);

    for (const word of ["Agenda", "Join", "here", "at noon", "Bye"]) {
      expect(written).toContain(word);
    }
    expect(written).not.toContain("<p>");
  });

  it("does not delete the rest of the description", () => {
    const malformed =
      "<p>Agenda</p><p>Join <a href=\"https://x.test/j>here</a> at noon</p><p>Bye</p>";

    expect(htmlToPlainText(malformed)).toContain("Bye");
  });

  it("does not delete text that follows a malformed anchor", () => {
    expect(htmlToPlainText("<p>Reply \"yes\"</p><a href=\"https://x.test/j>x</a><p>Bye</p>"))
      .toContain("Bye");
  });

  it("reads a document whose only fault is an unmatched end tag", () => {
    expect(htmlToPlainText("<blockquote><name>Agenda</blockquote><hr></blockquote>"))
      .toBe("<name>Agenda");
    expect(htmlToPlainText("<p>Agenda</p></div>")).toBe("Agenda");
  });

  it("keeps a placeholder token that real markup surrounds", () => {
    expect(htmlToPlainText("<p>Reply with <name> and <date>.<br>Thanks.</p>"))
      .toBe("Reply with <name> and <date>.\nThanks.");
  });

  it("preserves an angle-bracketed bare URL nested inside real markup", () => {
    expect(htmlToPlainText("<p>see <https://tel.meet/x?pin=1&hs=2></p>").trim())
      .toBe("see <https://tel.meet/x?pin=1&hs=2>");
  });

  it("keeps document scaffolding out of an Outlook-authored description", () => {
    const outlook = "<html><head><style>p{margin:0}</style></head><body>"
      + "<p>Hi</p><p>Join <a href=\"https://teams.microsoft.com/l/x?a=1&amp;b=2\">"
      + "Click here to join the meeting</a></p></body></html>";

    const plain = htmlToPlainText(outlook);

    expect(plain).not.toContain("<style>");
    expect(plain).not.toContain("<body");
  });

  it("does not truncate an unrecognized tag at a '>' inside an attribute value", () => {
    expect(htmlToPlainText("<custom-tag data-x=\"a>b\">kept</custom-tag> tail"))
      .toBe("kept tail");
  });

  it("does not split an unrecognized open tag at a quoted attribute's '>'", () => {
    expect(htmlToPlainText("<p>a <foo bar=\"x>y\">b</foo> c</p>")).toBe("a b c");
  });

  it("does not double-escape an escaped ampersand into &amp;copy;", () => {
    expect(htmlToPlainText("<p>Escape the symbol as &amp;copy; in the doc</p>"))
      .toBe("Escape the symbol as &copy; in the doc");
  });

  it("does not re-escape an ampersand that precedes a word and a semicolon", () => {
    expect(htmlToPlainText("<p>Q&amp;A; then demo</p>")).toBe("Q&A; then demo");
    expect(htmlToPlainText("<div>R&amp;D; sync</div>")).toBe("R&D; sync");
  });
});

describe("angle-bracketed text that is not markup", () => {
  it("leaves an angle-bracketed bare URL alone rather than reading it as a tag", () => {
    expect(htmlToPlainText("<p>see <https://tel.meet/x?pin=1&hs=2></p>"))
      .toBe("see <https://tel.meet/x?pin=1&hs=2>");
  });

  it("keeps an angle-bracketed void element name in a plain description", () => {
    expect(htmlToPlainText("Set the <input> field before you arrive"))
      .toBe("Set the <input> field before you arrive");
  });

  it("does not change how <b> is read because </br> appears later", () => {
    expect(containsMarkup("Bring the <b> form")).toBe(false);
    expect(htmlToPlainText("Bring the <b> form")).toBe("Bring the <b> form");
    expect(htmlToPlainText("Bring the <b> form </br>")).toBe("Bring the <b> form");
  });

  it("keeps plain angle-bracketed words when the same description also contains a <br>", () => {
    expect(htmlToPlainText("Bring the <table> printout and a <br> pen"))
      .toBe("Bring the <table> printout and a\npen");
    expect(containsMarkup("Bring the <table> printout")).toBe(false);
  });

  it("does not treat an unclosed <b as closed because </blockquote> appears later", () => {
    const plain = "Grade a<b or better";
    const withBlockquote = "Grade a<b or better</blockquote>";

    expect(containsMarkup(plain)).toBe(false);
    expect(containsMarkup(withBlockquote)).toBe(false);
    expect(htmlToPlainText(withBlockquote)).toContain("or better");
  });

  it("writes the note but compares as if it were absent", () => {
    expect(htmlToPlainText("Note <!important> stuff")).toBe("Note <!important> stuff");
    expect(canonicalizeComparableText("Note <!important> stuff")).toBe("Note <!important> stuff");
  });

  it("does not let a '<' with no '>' before the next one swallow the words between", () => {
    expect(canonicalizeComparableText("Compare <div with <span> tags"))
      .toBe("Compare <div with tags");
    expect(htmlToPlainText("Compare <div with <span> tags")).toBe("Compare <div with <span> tags");
  });
});

describe("anchor destinations in plain text", () => {
  it("keeps the destination of a labelled anchor reachable in plain text", () => {
    const plain = htmlToPlainText("<p>Join <a href=\"https://zoom.us/j/123\">Zoom Meeting</a></p>");

    expect(plain).toContain("https://zoom.us/j/123");
  });

  it("keeps a nested anchor's own destination", () => {
    expect(htmlToPlainText(
      "<a href=\"https://a.test\"><a href=\"https://b.test\">https://b.test</a></a>",
    )).toContain("b.test");
  });

  it("does not append the outer anchor's href to an already-labelled inner anchor", () => {
    expect(htmlToPlainText("<a href=\"https://a.test\"><a href=\"https://b.test\">Bee</a></a>"))
      .toBe("Bee (https://b.test)");
  });

  it("keeps an anchor href usable when its query was entity-escaped", () => {
    expect(htmlToPlainText("<a href=\"https://x.test/s?q=&lt;b&gt;&amp;n=1\">Search</a>"))
      .toBe("Search (https://x.test/s?q=<b>&n=1)");
  });

  it("keeps a relative destination reachable", () => {
    expect(htmlToPlainText("<a href=\"/agenda\">See the /agenda page</a>"))
      .toBe("See the /agenda page (/agenda)");
  });

  it("keeps a short destination reachable", () => {
    expect(htmlToPlainText("<a href=\"https://x.test\">Mirror of https://x.test/deck.pdf</a>"))
      .toContain("deck.pdf (https://x.test)");
  });
});

describe("blank lines and insignificant whitespace", () => {
  it("counts empty paragraphs consistently", () => {
    const one = canonicalizeComparableText("<div>a</div><div><br></div><div>b</div>");
    const two = canonicalizeComparableText(
      "<div>a</div><div><br></div><div><br></div><div>b</div>",
    );
    expect([one, two]).toEqual(["a\nb", "a\nb"]);
  });

  it("converges when the destination re-serializes the same HTML without inter-tag newlines", () => {
    expect(canonicalizeComparableText(PRETTY_OUTLOOK_BODY))
      .toBe(canonicalizeComparableText(COMPACT_ECHO));
  });

  it("does not compare a blank paragraph inserted remotely", () => {
    const local = "<p>Quarterly planning sync.</p><p>Join the meeting now</p>";
    const edited = "<p>Quarterly planning sync.</p><p><br></p><p>Join the meeting now</p>";

    expect(canonicalizeComparableText(edited)).toBe(canonicalizeComparableText(local));
  });

  it("still sees a genuine remote edit that inserts a line", () => {
    const local = "<p>Quarterly planning sync.</p><p>Join the meeting now</p>";
    const edited = "<p>Quarterly planning sync.</p><p>CANCELLED</p><p>Join the meeting now</p>";

    expect(canonicalizeComparableText(edited)).not.toBe(canonicalizeComparableText(local));
  });

  /*
   * A paragraph is worth the blank line every renderer draws around it, which
   * is the only reading that agrees with `<br><br>` above and with what the
   * write path owes a reader. The finding this pins is the whitespace: the
   * newline and the indent between the two tags must leave no trace.
   */
  it("does not write blank lines and trailing spaces into the CalDAV DESCRIPTION", () => {
    expect(htmlToPlainText(PRETTY_OUTLOOK_BODY))
      .toBe("Quarterly planning sync.\n\nJoin the meeting now");
  });
});

describe("escaped values compare equal to what they escape", () => {
  it("agrees with the plain text the CalDAV write path derives from the same source", () => {
    const written = htmlToPlainText(NESTED);

    expect(canonicalizeComparableText(written)).toBe(canonicalizeComparableText(NESTED));
  });

  it("converges when the provider escapes without introducing markup", () => {
    expect(canonicalizeComparableText("Tom &amp; Jerry"))
      .toBe(canonicalizeComparableText("Tom & Jerry"));
  });

  it("reaches a fixed point on a deeply escaped value", () => {
    const value = "<b>&lt;b&gt;&amp;lt;b&amp;gt;&amp;amp;lt;b&amp;amp;gt;x</b>";
    const once = canonicalizeComparableText(value);

    expect(canonicalizeComparableText(once)).toBe(once);
  });

  it("resolves an escaped tag to the structure it escapes", () => {
    expect(canonicalizeComparableText("Compare the &lt;div&gt; element"))
      .toBe(canonicalizeComparableText("Compare the <div> element"));
    expect(canonicalizeComparableText("<p>Compare the &lt;div&gt; element</p>"))
      .toBe("Compare the\nelement");
  });

  it("treats an escaped tag the same way it treats an escaped angle bracket", () => {
    expect(canonicalizeComparableText("&lt;")).toBe(canonicalizeComparableText("<"));
    expect(canonicalizeComparableText("Use &lt;b&gt;bold&lt;/b&gt; markers"))
      .toBe(canonicalizeComparableText("Use <b>bold</b> markers"));
  });

  it("converges with the unescaped description it was produced from", () => {
    const base = "Snacks & drinks <b>now</b>";
    expect(canonicalizeComparableText(escapeTimes(base, 17)))
      .toBe(canonicalizeComparableText(base));
  });

  it("compares a value equal to its own re-escaped echo at any depth", () => {
    const source = "<p>Team &amp; Co</p>";

    expect(canonicalizeComparableText(escapeTimes(source, 17)))
      .toBe(canonicalizeComparableText(source));
  });
});

describe("the comparison projection is idempotent", () => {
  it("is idempotent so both sides of a comparison land on the same value", () => {
    const once = canonicalizeComparableText(NESTED);

    expect(canonicalizeComparableText(once)).toBe(once);
  });

  it("is idempotent for a non-breaking space following a tag-shaped token", () => {
    const once = canonicalizeComparableText("<a&nbsp; ");

    expect(canonicalizeComparableText(once)).toBe(once);
  });

  it("is idempotent past seventeen escaping passes", () => {
    const value = escapeTimes("Snacks & drinks <b>now</b>", 17);
    expect(canonicalizeComparableText(canonicalizeComparableText(value)))
      .toBe(canonicalizeComparableText(value));
  });

  it("is idempotent however many times a destination re-escaped the value", () => {
    const once = canonicalizeComparableText(escapeTimes("<p>hello &amp; world</p>", 17));

    expect(canonicalizeComparableText(once)).toBe(once);
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
      expect(() => htmlToPlainText(input)).not.toThrow();
      expect(() => containsMarkup(input)).not.toThrow();
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

  it("is escaping-invariant: a description projects like its escaped echo", () => {
    const corpus = [
      "Snacks & drinks",
      "Use <b>bold</b> markers in the doc",
      "<p>Agenda item one<p>Agenda item two",
      "Wear a <hat> and bring the <table> printout",
      MEET_BLOCK,
      OUTLOOK_TEXT_BODY,
      "<div>a</div><a href=\"https://x.test/?q=1&y=2\">Join</a>",
    ];

    for (const value of corpus) {
      const escaped = value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

      expect(canonicalizeComparableText(escaped)).toBe(canonicalizeComparableText(value));
    }
  });

  it("is a refinement: equal inputs project equal", () => {
    const corpus = [MEET_BLOCK, OUTLOOK_TEXT_BODY, "<p>a</p>", "plain", ""];

    for (const value of corpus) {
      expect(canonicalizeComparableText(value)).toBe(canonicalizeComparableText(`${value}`));
    }
  });

  it("does not erase a description whose content is not itself markup", () => {
    expect(canonicalizeComparableText("<p>&lt;p&gt;Agenda&lt;/p&gt;</p>")).toBe("Agenda");
    expect(canonicalizeComparableText("<p>&lt;p&gt;&amp;lt;br&amp;gt;&lt;/p&gt;</p>"))
      .toBe(canonicalizeComparableText("<br>"));
  });

  it("treats a private-use character the same in markup and in plain text", () => {
    const marker = "\uE000";

    expect(canonicalizeComparableText(`<p>a${marker}b</p>`))
      .toBe(canonicalizeComparableText(`a${marker}b`));
  });

  it("keeps table cells separable", () => {
    expect(canonicalizeComparableText("<table><tr><td>a</td><td>b</td></tr></table>"))
      .not.toBe("ab");
  });

  it("keeps a non-empty description distinguishable from an empty one", () => {
    expect(canonicalizeComparableText("&lt;style&gt;<br>Room 4, bring the deck"))
      .not.toBe(canonicalizeComparableText(""));
  });
});
