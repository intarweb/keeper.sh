import { DomUtils, parseDocument } from "htmlparser2";

type ChildNode = ReturnType<typeof parseDocument>["children"][number];
type ElementNode = Extract<ChildNode, { attribs: Record<string, string> }>;

/*
 * A rendering contract, not a claim of exhaustiveness: anything outside this
 * set is reproduced verbatim, so an angle-bracketed bare URL survives instead
 * of being tokenized away as a tag named `https:`.
 */
const RENDERABLE_ELEMENTS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "table",
  "td",
  "th",
  "tr",
  "u",
  "ul",
]);

const NEWLINE_ELEMENTS = new Set(["br", "hr"]);

const BLOCK_ELEMENTS = new Set([
  "blockquote",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "table",
  "tr",
  "ul",
]);

const BREAK_MARKER = "\uE000";
const BREAK_RUN_PATTERN = /[\n\uE000]+/g;
const NEWLINE_PATTERN = /\n/g;
const INLINE_WHITESPACE_PATTERN = /[ \t]+/g;
const NON_BREAKING_SPACE_PATTERN = /\u00A0/g;
const SURROUNDING_BLANK_LINE_PATTERN = /^\n+|\n+$/g;
const CARRIAGE_RETURN_PATTERN = /\r\n?/g;
const URL_SHAPED_PATTERN =
  /^(?:[a-z][a-z0-9+.-]*:\/\/\S+|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]\S*)?)$/i;
const CANONICALIZATION_PASS_LIMIT = 3;

const hasRenderableElement = (nodes: ChildNode[]): boolean =>
  nodes.some((node) =>
    DomUtils.isTag(node)
    && (RENDERABLE_ELEMENTS.has(node.name) || hasRenderableElement(node.children)));

const containsRenderableHtml = (value: string): boolean =>
  value.includes("<") && hasRenderableElement(parseDocument(value).children);

/*
 * An unrecognized tag keeps its literal source. Its range can run past its own
 * markup when the parser closes it on an ancestor's end tag, so the opening tag
 * is taken up to its own `>` and the closing tag only when the range ends in it.
 */
const readUnrenderableElement = (
  source: string,
  element: ElementNode,
  inner: string,
): string => {
  const { endIndex, startIndex } = element;
  if (startIndex === null || endIndex === null) {
    throw new TypeError("htmlparser2 returned an element without source indices");
  }
  const tagEnd = source.indexOf(">", startIndex) + 1;
  if (tagEnd <= startIndex) {
    return `${source.slice(startIndex, endIndex + 1)}${inner}`;
  }
  const openTag = source.slice(startIndex, tagEnd);
  const closeTag = `</${element.name}>`;
  if (source.slice(startIndex, endIndex + 1).toLowerCase().endsWith(closeTag)) {
    return `${openTag}${inner}${closeTag}`;
  }
  return `${openTag}${inner}`;
};

const renderAnchor = (element: ElementNode, text: string): string => {
  const href = element.attribs["href"] ?? "";
  const trimmed = text.trim();
  if (href.length === 0) {
    return text;
  }
  if (trimmed.length === 0 || URL_SHAPED_PATTERN.test(trimmed)) {
    return href;
  }
  return text;
};

const renderNode = (source: string, node: ChildNode): string => {
  if (DomUtils.isText(node)) {
    return node.data;
  }
  if (!DomUtils.isTag(node)) {
    return "";
  }
  if (NEWLINE_ELEMENTS.has(node.name)) {
    return "\n";
  }
  const inner = node.children.map((child) => renderNode(source, child)).join("");
  if (!RENDERABLE_ELEMENTS.has(node.name)) {
    return readUnrenderableElement(source, node, inner);
  }
  if (node.name === "a") {
    return renderAnchor(node, inner);
  }
  if (BLOCK_ELEMENTS.has(node.name)) {
    return `${BREAK_MARKER}${inner}${BREAK_MARKER}`;
  }
  return inner;
};

const countNewlines = (value: string): number =>
  value.length - value.replaceAll(NEWLINE_PATTERN, "").length;

/*
 * A block boundary asks for at least one line break; explicit breaks in the
 * same run decide how many there actually are.
 */
const resolveBreakRuns = (value: string): string =>
  value.replaceAll(BREAK_RUN_PATTERN, (run) => "\n".repeat(Math.max(1, countNewlines(run))));

const htmlToPlainText = (value: string): string => {
  const document = parseDocument(value, { withEndIndices: true, withStartIndices: true });
  return resolveBreakRuns(
    document.children.map((child) => renderNode(value, child)).join(""),
  ).trim();
};

const collapseComparableWhitespace = (value: string): string =>
  value
    .replaceAll(NON_BREAKING_SPACE_PATTERN, " ")
    .split("\n")
    .map((line) => line.replaceAll(INLINE_WHITESPACE_PATTERN, " ").trim())
    .join("\n")
    .replaceAll(SURROUNDING_BLANK_LINE_PATTERN, "");

const projectComparableText = (value: string): string => {
  if (containsRenderableHtml(value)) {
    return collapseComparableWhitespace(htmlToPlainText(value));
  }
  return collapseComparableWhitespace(value);
};

/*
 * `<p>a &lt;br&gt; b</p>` projects to `a <br> b`, which a second pass reads as
 * a real break, so one pass is not a fixed point.
 */
const projectToFixedPoint = (value: string, remainingPasses: number): string => {
  const projected = projectComparableText(value);
  if (remainingPasses <= 1 || projected === value) {
    return projected;
  }
  return projectToFixedPoint(projected, remainingPasses - 1);
};

const canonicalizeComparableText = (value?: string): string =>
  projectToFixedPoint(
    value?.replaceAll(CARRIAGE_RETURN_PATTERN, "\n").trim() ?? "",
    CANONICALIZATION_PASS_LIMIT,
  );

export { canonicalizeComparableText, containsRenderableHtml, htmlToPlainText };
