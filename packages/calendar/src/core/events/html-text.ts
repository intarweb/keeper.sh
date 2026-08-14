import { DomUtils, Parser, parseDocument } from "htmlparser2";
import { decodeHTMLStrict } from "entities";

type ChildNode = ReturnType<typeof parseDocument>["children"][number];
type ElementNode = Extract<ChildNode, { attribs: Record<string, string> }>;
type MarkupPredicate = (node: ElementNode, facts: MarkupFacts) => boolean;

interface MarkupFacts {
  readonly closedElements: ReadonlySet<number>;
  readonly openTags: ReadonlyMap<number, string>;
}

interface ParsedDescription {
  readonly children: ChildNode[];
  readonly facts: MarkupFacts;
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

const HTML_ELEMENTS = new Set([
  ...VOID_ELEMENTS,
  "a",
  "abbr",
  "acronym",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "basefont",
  "bdi",
  "bdo",
  "big",
  "blockquote",
  "body",
  "button",
  "canvas",
  "caption",
  "center",
  "cite",
  "code",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "em",
  "fieldset",
  "figcaption",
  "figure",
  "font",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "html",
  "i",
  "iframe",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "main",
  "map",
  "mark",
  "marquee",
  "menu",
  "meter",
  "nav",
  "nobr",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "search",
  "section",
  "select",
  "slot",
  "small",
  "span",
  "strike",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "tt",
  "u",
  "ul",
  "var",
  "video",
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

const BREAK_ELEMENTS = new Set(["br", "hr"]);

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

const PARSE_OPTIONS = { withStartIndices: true } as const;
const COMPARISON_PASS_LIMIT = 16;

const BLOCK_BOUNDARY = "\uE000";
const LINE_BREAK = "\uE001";
const SENTINEL_PATTERN = /[\uE000\uE001]/g;
const SENTINEL_RUN_PATTERN = /[\uE000\uE001]+/g;
const LINE_BREAK_PATTERN = /\uE001/g;

const TAG_NAME = String.raw`[a-zA-Z][a-zA-Z\d]*(?:-[a-zA-Z\d]+)*(?::[a-zA-Z][a-zA-Z\d]*)?`;
const STRAY_ANGLE_PATTERN = new RegExp(String.raw`<(?![!?]|/?${TAG_NAME}[\s/>])`, "g");
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

const stripSentinels = (value: string): string => value.replaceAll(SENTINEL_PATTERN, "");

const resolveBreaks = (value: string): string =>
  value.replaceAll(SENTINEL_RUN_PATTERN, (run) =>
    "\n".repeat(Math.max(1, run.match(LINE_BREAK_PATTERN)?.length ?? 0)));

/*
 * Whether each end tag was written or inferred is htmlparser2's answer to
 * give, not something to grep back out of the source it just parsed. The open
 * tag is kept verbatim so a token that turns out not to be markup can be
 * written back exactly as its author typed it.
 */
const readMarkupFacts = (source: string): MarkupFacts => {
  const closedElements = new Set<number>();
  const openTags = new Map<number, string>();
  const openStarts: number[] = [];
  let parser: Parser | undefined = globalThis.undefined;
  const collector = new Parser({
    onopentag: () => {
      const start = parser?.startIndex ?? 0;
      openStarts.push(start);
      openTags.set(start, source.slice(start, (parser?.endIndex ?? start) + 1));
    },
    onparserinit: (instance) => {
      parser = instance;
    },
    onclosetag: (name, isImplied) => {
      const start = openStarts.pop();
      if (start !== globalThis.undefined && !isImplied && !VOID_ELEMENTS.has(name)) {
        closedElements.add(start);
      }
    },
  });
  collector.end(source);

  return { closedElements, openTags };
};

const readDescription = (value: string): ParsedDescription => {
  const source = escapeStrayAngles(value);
  return { children: parseDocument(source, PARSE_OPTIONS).children, facts: readMarkupFacts(source) };
};

const wasExplicitlyClosed = (node: ElementNode, facts: MarkupFacts): boolean =>
  facts.closedElements.has(node.startIndex ?? -1);

const hasValuedAttribute = (node: ElementNode): boolean =>
  Object.values(node.attribs).some((value) => value.length > 0);

/*
 * DESCRIPTION is a plain-text field, so the write path may never delete a word
 * to make one: `Set the <input> field` is the sentence its author typed, and
 * only a closed element, a line break or an attribute someone wrote a value
 * for is confident enough to be read as structure.
 */
const isWrittenAsMarkup: MarkupPredicate = (node, facts) =>
  BREAK_ELEMENTS.has(node.name) || hasValuedAttribute(node) || wasExplicitlyClosed(node, facts);

/*
 * Comparison only has to answer "did this event change", so it reads every
 * element the HTML vocabulary defines as structure — a destination that closes
 * `<p>Agenda<p>Agenda` for us then compares equal. A name outside the
 * vocabulary is a placeholder like `<date>`, and stays visible to comparison.
 */
const isComparedAsMarkup: MarkupPredicate = (node, facts) =>
  HTML_ELEMENTS.has(node.name) || isWrittenAsMarkup(node, facts);

const readOpenTag = (node: ElementNode, facts: MarkupFacts): string => {
  const source = facts.openTags.get(node.startIndex ?? -1);
  if (source === globalThis.undefined) {
    throw new Error(`Unparsed open tag for <${node.name}> at ${node.startIndex}`);
  }
  return decodeHTMLStrict(stripSentinels(source));
};

const normalizeLinkTarget = (value: string): string =>
  value.replace(LINK_SCHEME_PATTERN, "").replace(TRAILING_SLASH_PATTERN, "");

/*
 * A provider that linkifies `support.google.com` invents both the scheme and
 * the trailing slash, so an anchor whose text is its own destination projects
 * to that text alone. A labelled anchor keeps its destination beside the
 * label: readable in a CalDAV client, and still sensitive to a repointed link.
 */
const renderAnchor = (element: ElementNode, inner: string): string => {
  const href = element.attribs["href"]?.trim() ?? "";
  const text = resolveBreaks(inner).trim();
  if (href.length === 0) {
    return inner;
  }
  if (text.length === 0) {
    return href;
  }
  if (DomUtils.findOne((node) => node.name === "a", element.children, true) !== null) {
    return inner;
  }
  const target = normalizeLinkTarget(href);
  const label = normalizeLinkTarget(text);
  if (label === target || text.includes(href)) {
    return inner;
  }
  if (URL_SHAPED_PATTERN.test(text) && target.startsWith(label)) {
    return href;
  }
  return `${text} (${href})`;
};

const renderNode = (
  node: ChildNode,
  facts: MarkupFacts,
  isMarkup: MarkupPredicate,
): string => {
  if (DomUtils.isText(node)) {
    return stripSentinels(node.data);
  }
  if (!DomUtils.isTag(node)) {
    return "";
  }
  const children = (): string =>
    node.children.map((child) => renderNode(child, facts, isMarkup)).join("");
  if (!isMarkup(node, facts)) {
    return readOpenTag(node, facts) + children();
  }
  if (DISCARDED_ELEMENTS.has(node.name)) {
    return "";
  }
  if (BREAK_ELEMENTS.has(node.name)) {
    return LINE_BREAK;
  }
  const inner = children();
  if (node.name === "a") {
    return renderAnchor(node, inner);
  }
  if (CELL_ELEMENTS.has(node.name)) {
    return ` ${inner} `;
  }
  if (BLOCK_ELEMENTS.has(node.name)) {
    return `${BLOCK_BOUNDARY}${inner}${BLOCK_BOUNDARY}`;
  }
  return inner;
};

const renderNodes = (
  nodes: ChildNode[],
  facts: MarkupFacts,
  isMarkup: MarkupPredicate,
): string => nodes.map((node) => renderNode(node, facts, isMarkup)).join("");

const renderDescription = (parsed: ParsedDescription, isMarkup: MarkupPredicate): string =>
  resolveBreaks(renderNodes(parsed.children, parsed.facts, isMarkup));

const hasWrittenMarkup = (nodes: ChildNode[], facts: MarkupFacts): boolean =>
  nodes.some((node) =>
    DomUtils.isTag(node)
    && (isWrittenAsMarkup(node, facts) || hasWrittenMarkup(node.children, facts)));

const containsMarkup = (value: string): boolean => {
  if (!value.includes("<")) {
    return false;
  }
  const parsed = readDescription(value);
  return hasWrittenMarkup(parsed.children, parsed.facts);
};

const htmlToPlainText = (value: string): string => {
  if (!value.includes("<")) {
    return value;
  }
  const parsed = readDescription(value);
  if (!hasWrittenMarkup(parsed.children, parsed.facts)) {
    return value;
  }
  return renderDescription(parsed, isWrittenAsMarkup).trim();
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

/*
 * Rendering strictly consumes markup and entities, so repeating it terminates,
 * and its fixed point is the same value for a description, for that
 * description escaped, and for it escaped twice — which is what a destination
 * that re-escapes what Keeper wrote hands back on the next sync.
 */
const reduceToComparableFixedPoint = (value: string, remaining: number): string => {
  const reduced = collapseComparableWhitespace(
    renderDescription(readDescription(value), isComparedAsMarkup),
  );
  if (reduced === value || remaining === 0) {
    return reduced;
  }
  return reduceToComparableFixedPoint(reduced, remaining - 1);
};

/*
 * Comparison starts from the plain text the write path would have produced, so
 * a mirror Keeper wrote and the description it was written from land on the
 * same value however the two projections read the markup between them.
 */
const canonicalizeComparableText = (value?: string): string =>
  collapseComparableWhitespace(normalizeComparableUrls(reduceToComparableFixedPoint(
    htmlToPlainText(value?.replaceAll(CARRIAGE_RETURN_PATTERN, "\n") ?? ""),
    COMPARISON_PASS_LIMIT,
  )));

export { canonicalizeComparableText, containsMarkup, htmlToPlainText };
