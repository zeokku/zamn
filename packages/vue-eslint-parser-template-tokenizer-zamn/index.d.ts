/**
 * Pass it to vue-eslint-parser, as the class or by package name:
 *
 *     parserOptions: { templateTokenizer: { zamn: ZamnTokenizer } }
 */
export default class ZamnTokenizer {
  constructor(
    text: string,
    code: string,
    position: { startingLine: number; startingColumn: number },
  );
  /** The next StartTag, EndTag, Text or Mustache token, or null at the end. */
  nextToken(): object | null;
  readonly tokens: object[];
  readonly comments: object[];
  readonly errors: object[];
}
