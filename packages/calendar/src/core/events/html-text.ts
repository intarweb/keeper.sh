import { DomHandler, DomUtils, ElementType, Parser } from "htmlparser2";
import { decodeHTML } from "entities";

type ChildNode = InstanceType<typeof DomHandler>["dom"][number];
type ElementNode = Extract<ChildNode, { attribs: Record<string, string> }>;

type MarkupPredicate = (node: ElementNode, closedElements: ReadonlySet<ChildNode>) => boolean;

interface ParsedDescription {
  readonly children: ChildNode[];
  readonly closedElements: ReadonlySet<ChildNode>;
  readonly isComplete: boolean;
}

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

const CELL_ELEMENTS = new Set(["td", "th"]);

const LINE_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "body",
  "caption",
  "dd",
  "div",
  "dt",
  "figcaption",
  "footer",
  "header",
  "html",
  "li",
  "main",
  "nav",
  "section",
  "tbody",
  "tfoot",
  "thead",
  "tr",
]);

const PARAGRAPH_ELEMENTS = new Set([
  "blockquote",
  "dl",
  "fieldset",
  "figure",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ol",
  "p",
  "pre",
  "table",
  "ul",
]);

const PARSE_OPTIONS = {
  lowerCaseAttributeNames: false,
  lowerCaseTags: false,
} as const;

const LINE_BREAK = "\uE000";
const LINE_BOUNDARY = "\uE001";
const PARAGRAPH_BOUNDARY = "\uE002";
const SENTINEL_PATTERN = /[\uE000-\uE002]/g;
const SEPARATOR_RUN_PATTERN = /[ \t\n]*(?:[\uE000-\uE002][ \t\n]*)+/g;

const TAG_NAME = String.raw`[a-zA-Z][a-zA-Z\d]*(?:-[a-zA-Z\d]+)*(?::[a-zA-Z][a-zA-Z\d]*)?`;
const TAG_OPENER_PATTERN = new RegExp(String.raw`<(?![!?]|/?${TAG_NAME}[\s/>])`, "g");
const TAG_TOKEN_PATTERN = new RegExp(String.raw`</?${TAG_NAME}(?:\s[^<>]*)?/?>`, "g");
const LINK_SCHEME_PATTERN = /^(?:[a-z][a-z\d+.-]*:\/\/|mailto:|tel:)/i;
const TRAILING_SLASH_PATTERN = /\/+$/;
const TRUNCATION_MARKER_PATTERN = /(?:…|\.{2,})$/;
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
  value.replaceAll(TAG_OPENER_PATTERN, "&lt;");

const normalizeLineEndings = (value: string): string =>
  value.replaceAll(CARRIAGE_RETURN_PATTERN, "\n");

const stripSentinels = (value: string): string => value.replaceAll(SENTINEL_PATTERN, "");

/*
 * Whitespace between two tags is insignificant in HTML, so it joins the
 * separator run rather than splitting it. A paragraph is worth the blank line
 * every renderer draws around it, which is also what a destination that
 * rewrites paragraphs as `<br><br>` hands back.
 */
const countSeparatorLines = (run: string): number => {
  const breaks = run.split(LINE_BREAK).length - 1;
  if (run.includes(PARAGRAPH_BOUNDARY)) {
    return breaks + 2;
  }
  if (run.includes(LINE_BOUNDARY)) {
    return breaks + 1;
  }
  return breaks;
};

const resolveSeparators = (value: string): string =>
  value.replaceAll(SEPARATOR_RUN_PATTERN, (run) => "\n".repeat(countSeparatorLines(run)));

/*
 * Whether an end tag was written or inferred is htmlparser2's answer to give,
 * and it is recorded against the element itself so nothing has to be matched
 * back up by source offset afterwards.
 */
class DescriptionHandler extends DomHandler {
  readonly closedElements = new Set<ChildNode>();

  override onclosetag(name?: string, isImplied?: boolean): void {
    const element = this.tagStack.at(-1);
    if (isImplied !== true && element !== globalThis.undefined && DomUtils.isTag(element)) {
      this.closedElements.add(element);
    }
    super.onclosetag();
  }
}

/*
 * A tag left unterminated at end of input takes the rest of the document into
 * itself and htmlparser2 then drops both, so the parse is only usable when the
 * parser reports having read as far as the last character of its source.
 */
const parseDescription = (source: string): ParsedDescription => {
  const handler = new DescriptionHandler();
  const parser = new Parser(handler, PARSE_OPTIONS);
  parser.end(source);

  return {
    children: handler.dom,
    closedElements: handler.closedElements,
    isComplete: parser.endIndex >= source.length - 1,
  };
};

const hasValuedAttribute = (node: ElementNode): boolean =>
  Object.values(node.attribs).some((value) => value.length > 0);

/*
 * DESCRIPTION is a plain-text field, so the write path may never delete a word
 * to make one: `Set the <input> field` is the sentence its author typed, and
 * only a closed element, a line break or an attribute someone wrote a value
 * for is confident enough to be read as structure.
 */
const isWrittenAsMarkup: MarkupPredicate = (node, closedElements) =>
  BREAK_ELEMENTS.has(node.name.toLowerCase())
  || hasValuedAttribute(node)
  || closedElements.has(node);

/*
 * Comparison only has to answer "did this event change", so it reads every tag
 * as structure and no vocabulary of element names decides which ones count: a
 * destination that closes `<p>Agenda<p>Agenda` for us then compares equal.
 */
const isComparedAsMarkup: MarkupPredicate = () => true;

/** Only an element with no attribute value is text, so there is no value to quote. */
const readOpenTag = (node: ElementNode): string =>
  `<${node.name}${Object.keys(node.attribs).map((name) => ` ${name}`).join("")}>`;

const normalizeLinkTarget = (value: string): string =>
  value.replace(LINK_SCHEME_PATTERN, "").replace(TRAILING_SLASH_PATTERN, "");

/*
 * A provider that linkifies `support.google.com` invents both the scheme and
 * the trailing slash, and one that renders a long URL shortens it to a prefix
 * with an ellipsis, so an anchor whose text is its own destination projects to
 * that destination alone. A labelled anchor keeps its destination beside the
 * label: readable in a CalDAV client, and still sensitive to a repointed link.
 */
const renderAnchor = (element: ElementNode, inner: string): string => {
  const href = element.attribs["href"]?.trim() ?? "";
  const text = resolveSeparators(inner).trim();
  if (href.length === 0) {
    return inner;
  }
  if (text.length === 0) {
    return href;
  }
  if (DomUtils.findOne((node) => node.name.toLowerCase() === "a", element.children, true) !== null) {
    return inner;
  }
  const target = normalizeLinkTarget(href);
  const label = normalizeLinkTarget(text);
  if (label === target) {
    return inner;
  }
  const shownPrefix = label.replace(TRUNCATION_MARKER_PATTERN, "");
  if (URL_SHAPED_PATTERN.test(text) && shownPrefix.length > 0 && target.startsWith(shownPrefix)) {
    return href;
  }
  return `${text} (${href})`;
};

const renderNode = (
  node: ChildNode,
  closedElements: ReadonlySet<ChildNode>,
  isMarkup: MarkupPredicate,
): string => {
  if (DomUtils.isText(node)) {
    return stripSentinels(node.data);
  }
  if (node.type === ElementType.Directive) {
    return `<${stripSentinels(node.data)}>`;
  }
  if (!DomUtils.isTag(node)) {
    return "";
  }
  const children = (): string =>
    node.children.map((child) => renderNode(child, closedElements, isMarkup)).join("");
  if (!isMarkup(node, closedElements)) {
    return readOpenTag(node) + children();
  }
  const name = node.name.toLowerCase();
  if (DISCARDED_ELEMENTS.has(name) && closedElements.has(node)) {
    return "";
  }
  if (BREAK_ELEMENTS.has(name)) {
    return LINE_BREAK;
  }
  const inner = children();
  if (name === "a") {
    return renderAnchor(node, inner);
  }
  if (CELL_ELEMENTS.has(name)) {
    return ` ${inner} `;
  }
  if (PARAGRAPH_ELEMENTS.has(name)) {
    return `${PARAGRAPH_BOUNDARY}${inner}${PARAGRAPH_BOUNDARY}`;
  }
  if (LINE_ELEMENTS.has(name)) {
    return `${LINE_BOUNDARY}${inner}${LINE_BOUNDARY}`;
  }
  return inner;
};

/*
 * Markup a parser cannot finish reading is markup that would take the author's
 * words with it, so the tags come off as text and every word survives.
 */
const stripMarkupTokens = (source: string): string =>
  decodeHTML(source.replaceAll(TAG_TOKEN_PATTERN, " "));

const renderDescription = (value: string, isMarkup: MarkupPredicate): string => {
  const source = escapeStrayAngles(normalizeLineEndings(value));
  const parsed = parseDescription(source);
  if (!parsed.isComplete) {
    return stripMarkupTokens(source);
  }

  return resolveSeparators(
    parsed.children.map((node) => renderNode(node, parsed.closedElements, isMarkup)).join(""),
  );
};

const hasWrittenMarkup = (nodes: ChildNode[], closedElements: ReadonlySet<ChildNode>): boolean =>
  nodes.some((node) =>
    DomUtils.isTag(node)
    && (isWrittenAsMarkup(node, closedElements)
      || hasWrittenMarkup(node.children, closedElements)));

const containsMarkup = (value: string): boolean => {
  if (!value.includes("<")) {
    return false;
  }
  const parsed = parseDescription(escapeStrayAngles(normalizeLineEndings(value)));

  return hasWrittenMarkup(parsed.children, parsed.closedElements);
};

/*
 * Entities stay encoded in a description that carries no markup: `A &amp; B`
 * is then the sentence its author typed, not an escape of one.
 */
const htmlToPlainText = (value: string): string => {
  if (!containsMarkup(value)) {
    return value;
  }

  return renderDescription(value, isWrittenAsMarkup).trim();
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

const reduceComparableText = (value: string): string =>
  collapseComparableWhitespace(
    normalizeComparableUrls(renderDescription(value, isComparedAsMarkup)),
  );

/*
 * Each pass consumes markup and entities and creates neither, so repeating it
 * reaches a value it leaves alone rather than a value it has run out of turns
 * to reduce. A destination that re-escapes what Keeper wrote costs one more
 * pass, however many times it has done so.
 */
const reduceToComparableFixedPoint = (value: string): string => {
  const reduced = reduceComparableText(value);

  if (reduced === value) {
    return reduced;
  }

  return reduceToComparableFixedPoint(reduced);
};

/*
 * Rendering a description to plain text can uncover markup an entity was
 * hiding, so comparison repeats the write path until it uncovers nothing.
 * Writing a mirror and reading it back is then one of those passes, which is
 * what makes the mirror and the description it was written from compare equal.
 */
const reduceToWrittenFixedPoint = (value: string): string => {
  const written = htmlToPlainText(value);

  if (written === value) {
    return written;
  }

  return reduceToWrittenFixedPoint(written);
};

const canonicalizeComparableText = (value?: string): string =>
  reduceToComparableFixedPoint(reduceToWrittenFixedPoint(normalizeLineEndings(value ?? "")));

export { canonicalizeComparableText, containsMarkup, htmlToPlainText };
