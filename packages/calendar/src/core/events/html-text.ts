import { DomUtils, parseDocument } from "htmlparser2";
import { decodeHTMLStrict } from "entities";

type ChildNode = ReturnType<typeof parseDocument>["children"][number];
type ElementNode = Extract<ChildNode, { attribs: Record<string, string> }>;
type Segment = { readonly text: string } | { readonly breaks: number };

interface TextAccumulator {
  readonly parts: readonly string[];
  readonly breaks: number | null;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const DISCARDED_ELEMENTS = new Set([
  "head",
  "link",
  "meta",
  "noscript",
  "script",
  "style",
  "template",
  "title",
]);

const LINE_BREAK_ELEMENTS = new Set(["br", "hr"]);

const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "html",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "tfoot",
  "thead",
  "tr",
  "ul",
]);

const CELL_ELEMENTS = new Set(["td", "th"]);

const TAG_NAME = String.raw`[a-zA-Z][a-zA-Z\d]*(?:-[a-zA-Z\d]+)*(?::[a-zA-Z][a-zA-Z\d]*)?`;
const TAG_OPENER_PATTERN = new RegExp(String.raw`<(?=[!?]|/?${TAG_NAME}[\s/>])`, "g");
const STRAY_ANGLE_PATTERN = new RegExp(String.raw`<(?![!?]|/?${TAG_NAME}[\s/>])`, "g");
const TAG_TOKEN_PATTERN = new RegExp(String.raw`<(/?${TAG_NAME}(?:[\s/][^<>]*)?)>`, "g");
const ENTITY_AMPERSAND_PATTERN = /&(?=(?:[a-zA-Z][a-zA-Z\d]*|#\d+|#[xX][\da-fA-F]+);)/g;
const LINK_SCHEME_PATTERN = /^(?:[a-z][a-z\d+.-]*:\/\/|mailto:|tel:)/i;
const TRAILING_SLASH_PATTERN = /\/+$/;
const URL_SHAPED_PATTERN =
  /^(?:[a-z][a-z\d+.-]*:\/\/\S+|[a-z\d-]+(?:\.[a-z\d-]+)+(?:[/?#]\S*)?)$/i;
const URL_TOKEN_PATTERN =
  /(?:[a-z][a-z\d+.-]*:\/\/)?(?:[a-z\d-]+\.)+[a-z][a-z\d-]*(?::\d+)?(?:[/?#]\S*)?/gi;
const INLINE_WHITESPACE_PATTERN = /[ \t]+/g;
const NON_BREAKING_SPACE_PATTERN = /\u00A0/g;
const SURROUNDING_BLANK_LINE_PATTERN = /^\n+|\n+$/g;
const CARRIAGE_RETURN_PATTERN = /\r\n?/g;

/*
 * `<https://tel.meet/x?pin=1&hs=2>` is text, not a tag: only a well-formed tag
 * opener keeps its angle bracket before the document is parsed.
 */
const escapeStrayAngles = (value: string): string =>
  value.replaceAll(STRAY_ANGLE_PATTERN, "&lt;");

/*
 * Escaping every construct the projection would otherwise re-read makes it a
 * fixed point, so a value Keeper has already projected and written projects
 * again to itself instead of decaying one level per sync.
 */
const neutralizeMarkup = (value: string): string =>
  value
    .replaceAll(ENTITY_AMPERSAND_PATTERN, "&amp;")
    .replaceAll(TAG_TOKEN_PATTERN, (tag, token: string) => `&lt;${token}&gt;`)
    .replaceAll(TAG_OPENER_PATTERN, "&lt;");

const hasMarkupElement = (nodes: ChildNode[], closingTags: string): boolean =>
  nodes.some((node) =>
    DomUtils.isTag(node)
    && (VOID_ELEMENTS.has(node.name)
      || closingTags.includes(`</${node.name}`)
      || hasMarkupElement(node.children, closingTags)));

/*
 * An element counts as markup only when it is void or explicitly closed, so
 * `Bring the <table> layout printout` stays the plain text it is.
 */
const containsMarkup = (value: string): boolean => {
  if (!value.includes("<")) {
    return false;
  }
  const source = escapeStrayAngles(value);
  return hasMarkupElement(parseDocument(source).children, source.toLowerCase());
};

const renderBreaks = (breaks: number | null): string[] => {
  if (breaks === null) {
    return [];
  }
  return ["\n".repeat(Math.max(1, breaks))];
};

/*
 * A block boundary asks for at least one line break; the explicit breaks in
 * the same run decide how many there actually are.
 */
const appendSegment = (accumulator: TextAccumulator, segment: Segment): TextAccumulator => {
  if ("text" in segment) {
    return {
      breaks: null,
      parts: [...accumulator.parts, ...renderBreaks(accumulator.breaks), segment.text],
    };
  }
  return {
    breaks: (accumulator.breaks ?? 0) + segment.breaks,
    parts: accumulator.parts,
  };
};

const segmentsToText = (segments: Segment[]): string => {
  let accumulator: TextAccumulator = { breaks: null, parts: [] };
  for (const segment of segments) {
    accumulator = appendSegment(accumulator, segment);
  }
  return accumulator.parts.join("");
};

const normalizeLinkTarget = (value: string): string =>
  value.replace(LINK_SCHEME_PATTERN, "").replace(TRAILING_SLASH_PATTERN, "");

/*
 * A provider that linkifies `support.google.com` invents both the scheme and
 * the trailing slash, so an anchor whose text is its own destination projects
 * to that text alone. A labelled anchor keeps its destination beside the
 * label: readable in a CalDAV client, and still sensitive to a repointed link.
 */
const renderAnchor = (element: ElementNode, inner: Segment[]): Segment[] => {
  const href = element.attribs["href"]?.trim() ?? "";
  const text = segmentsToText(inner).trim();
  if (href.length === 0) {
    return inner;
  }
  if (text.length === 0) {
    return [{ text: href }];
  }
  const target = normalizeLinkTarget(href);
  const label = normalizeLinkTarget(text);
  if (label === target || text.includes(href)) {
    return inner;
  }
  if (URL_SHAPED_PATTERN.test(text) && target.startsWith(label)) {
    return [{ text: href }];
  }
  return [...inner, { text: ` (${href})` }];
};

const renderNode = (node: ChildNode): Segment[] => {
  if (DomUtils.isText(node)) {
    return [{ text: node.data }];
  }
  if (!DomUtils.isTag(node) || DISCARDED_ELEMENTS.has(node.name)) {
    return [];
  }
  if (LINE_BREAK_ELEMENTS.has(node.name)) {
    return [{ breaks: 1 }];
  }
  const inner = node.children.flatMap(renderNode);
  if (node.name === "a") {
    return renderAnchor(node, inner);
  }
  if (CELL_ELEMENTS.has(node.name)) {
    return [{ text: " " }, ...inner, { text: " " }];
  }
  if (BLOCK_ELEMENTS.has(node.name)) {
    return [{ breaks: 0 }, ...inner, { breaks: 0 }];
  }
  return inner;
};

const renderMarkup = (value: string): string =>
  segmentsToText(parseDocument(escapeStrayAngles(value)).children.flatMap(renderNode)).trim();

const htmlToPlainText = (value: string): string => {
  if (!containsMarkup(value)) {
    return value;
  }
  return neutralizeMarkup(renderMarkup(value));
};

const collapseComparableWhitespace = (value: string): string =>
  value
    .replaceAll(NON_BREAKING_SPACE_PATTERN, " ")
    .split("\n")
    .map((line) => line.replaceAll(INLINE_WHITESPACE_PATTERN, " ").trim())
    .join("\n")
    .replaceAll(SURROUNDING_BLANK_LINE_PATTERN, "");

/*
 * Whether a URL carries its scheme and its trailing slash is decided by
 * whichever side linkified it, so comparison reads every URL in the one form
 * both sides can reach.
 */
const normalizeComparableUrls = (value: string): string =>
  value.replaceAll(URL_TOKEN_PATTERN, normalizeLinkTarget);

const readProjectionSource = (value: string): string => {
  if (containsMarkup(value)) {
    return renderMarkup(value);
  }
  return decodeHTMLStrict(value);
};

const projectComparableText = (value: string): string =>
  neutralizeMarkup(normalizeComparableUrls(readProjectionSource(value)));

const canonicalizeComparableText = (value?: string): string =>
  collapseComparableWhitespace(
    projectComparableText(value?.replaceAll(CARRIAGE_RETURN_PATTERN, "\n").trim() ?? ""),
  );

export { canonicalizeComparableText, containsMarkup, htmlToPlainText };
