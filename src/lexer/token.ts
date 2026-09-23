import type { TokenKind } from "./tokenKind.js";

export interface Token {
  readonly kind: TokenKind;
  readonly lexeme: string;
  readonly line: number;
  readonly column: number;
  readonly start: number;
  readonly end: number;
}
