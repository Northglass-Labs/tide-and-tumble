/**
 * Parses JSON with comments and trailing commas, which is what wrangler.jsonc
 * is. Text inside strings is left alone, so an address like "https://..."
 * is not mistaken for a comment.
 *
 * @param {string} text
 * @returns {unknown}
 */
export function parseJsonc(text) {
  let json = "";
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      // Copy the whole string, honouring escaped quotes.
      const start = index;
      index += 1;
      while (index < text.length && text[index] !== '"') {
        index += text[index] === "\\" ? 2 : 1;
      }
      index += 1;
      json += text.slice(start, index);
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") {
        index += 1;
      }
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
    } else if (char === "," && /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*[}\]]/.test(text.slice(index + 1))) {
      // A comma with nothing after it but the closing bracket.
      index += 1;
    } else {
      json += char;
      index += 1;
    }
  }

  return JSON.parse(json);
}
