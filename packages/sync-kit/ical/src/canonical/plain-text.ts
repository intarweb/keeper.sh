import type { IcsLimits } from "../options";

const doubleEncodedEntity = /&amp;(amp|lt|gt|quot|nbsp|#\d+);/gu;

const decodedOnce = (text: string): string => text.replaceAll(doubleEncodedEntity, "&$1;");

const escapedMarkup = (tag: string): string =>
  tag.replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const tagAt = (text: string, index: number): number => {
  const closing = text.indexOf(">", index);
  if (closing === -1) {
    return -1;
  }
  return closing;
};

const withoutMarkup = (text: string, maxDepth: number): string => {
  let result = "";
  let depth = 0;
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character !== "<") {
      result = `${result}${character}`;
      index += 1;
      continue;
    }
    const closing = tagAt(text, index);
    if (closing === -1) {
      result = `${result}${text.slice(index)}`;
      return result;
    }
    const isClosingTag = text[index + 1] === "/";
    if (isClosingTag && depth > 0) {
      depth -= 1;
      index = closing + 1;
      continue;
    }
    if (!isClosingTag && depth < maxDepth) {
      depth += 1;
      index = closing + 1;
      continue;
    }
    result = `${result}${escapedMarkup(text.slice(index, closing + 1))}`;
    index = closing + 1;
  }
  return result;
};

const toPlainTextDescription = (description: string, limits: IcsLimits): string =>
  decodedOnce(withoutMarkup(description, limits.maxDescriptionDepth));

export { toPlainTextDescription };
