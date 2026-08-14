const BACKSLASH_PATTERN = /\\/g;
const SEMICOLON_PATTERN = /;/g;
const COMMA_PATTERN = /,/g;
const LINE_BREAK_PATTERN = /\r\n?|\n/g;

/** RFC 5545 3.3.11, for property values the generator does not escape itself. */
const escapeIcsText = (value: string): string =>
  value
    .replaceAll(BACKSLASH_PATTERN, String.raw`\\`)
    .replaceAll(SEMICOLON_PATTERN, String.raw`\;`)
    .replaceAll(COMMA_PATTERN, String.raw`\,`)
    .replaceAll(LINE_BREAK_PATTERN, String.raw`\n`);

export { escapeIcsText };
