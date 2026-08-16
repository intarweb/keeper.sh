const escapedBackslash = String.raw`\\`;
const escapedSemicolon = String.raw`\;`;
const escapedComma = String.raw`\,`;
const escapedNewline = String.raw`\n`;

const backslash = /\\/u;
const everyBackslash = /\\/gu;

const escapeTextValue = (value: string): string =>
  value
    .replaceAll(everyBackslash, escapedBackslash)
    .replaceAll(";", escapedSemicolon)
    .replaceAll(",", escapedComma)
    .replaceAll("\r\n", escapedNewline)
    .replaceAll("\n", escapedNewline);

const unescaped = (character: string): string => {
  if (character === "n" || character === "N") {
    return "\n";
  }
  return character;
};

const unescapeTextValue = (value: string): string => {
  let result = "";
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      result = `${result}${unescaped(character)}`;
      escaped = false;
      continue;
    }
    if (backslash.test(character)) {
      escaped = true;
      continue;
    }
    result = `${result}${character}`;
  }
  return result;
};

const needsQuoting = (value: string): boolean =>
  value.includes(":") || value.includes(";") || value.includes(",");

const quoteParameterValue = (value: string): string => {
  const stripped = value.replaceAll('"', "");
  if (!needsQuoting(stripped)) {
    return stripped;
  }
  return `"${stripped}"`;
};

export { escapeTextValue, quoteParameterValue, unescapeTextValue };
