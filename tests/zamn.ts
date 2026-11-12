/**
 * Tag for writing zamn templates in tests as they would appear in a file:
 *
 *     const source = zamn`
 *       div {
 *         p text
 *       }
 *     `;
 *
 * The line break after the opening backtick and the indentation before the
 * closing one are dropped, the common indentation is removed, and the result
 * ends with a newline. Escapes work as in any template literal, so a
 * literal backslash is `\\`. Write whitespace at the end of a line as `${" "}`
 * so it is visible and survives editors that trim it.
 */
export function zamn(strings: TemplateStringsArray, ...values: unknown[]): string {
  const text = String.raw({ raw: strings }, ...values);
  const lines = text.replace(/^\n/, "").replace(/\n[ \t]*$/, "").split("\n");
  const indent = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)![0].length),
  );
  return lines.map((line) => line.slice(indent)).join("\n") + "\n";
}
