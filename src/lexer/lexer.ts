import type { CompilerError } from "../diagnostics/diagnostics.js";
import { KEYWORDS } from "./tokenKind.js";
import type { TokenKind } from "./tokenKind.js";
import type { Token } from "./token.js";

export interface LexResult {
  tokens: Token[];
  errors: CompilerError[];
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}

function isAlphaNumeric(c: string): boolean {
  return isAlpha(c) || isDigit(c);
}

/**
 * Hand-written lexical analyzer for CodeFlow.
 *
 * Comments (`// ...` to end of line) are skipped as an implementation-level
 * lexical convenience; they are not part of the CodeFlow grammar and never
 * reach the token stream.
 */
export class Lexer {
  private readonly source: string;
  private pos = 0;
  private line = 1;
  private column = 1;

  private readonly tokens: Token[] = [];
  private readonly errors: CompilerError[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): LexResult {
    while (!this.isAtEnd()) {
      this.scanToken();
    }
    this.tokens.push({
      kind: "EOF",
      lexeme: "",
      line: this.line,
      column: this.column,
      start: this.pos,
      end: this.pos,
    });
    return { tokens: this.tokens, errors: this.errors };
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(): string {
    return this.isAtEnd() ? "\0" : this.source[this.pos]!;
  }

  private peekNext(): string {
    return this.pos + 1 >= this.source.length ? "\0" : this.source[this.pos + 1]!;
  }

  private advance(): string {
    const c = this.source[this.pos]!;
    this.pos++;
    if (c === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return c;
  }

  private match(expected: string): boolean {
    if (this.peek() !== expected) return false;
    this.advance();
    return true;
  }

  private addToken(kind: TokenKind, startLine: number, startColumn: number, startPos: number): void {
    this.tokens.push({
      kind,
      lexeme: this.source.slice(startPos, this.pos),
      line: startLine,
      column: startColumn,
      start: startPos,
      end: this.pos,
    });
  }

  private reportError(message: string, startLine: number, startColumn: number, length: number): void {
    this.errors.push({ stage: "lexical", message, line: startLine, column: startColumn, length });
  }

  private scanToken(): void {
    const c = this.peek();

    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      this.advance();
      return;
    }

    if (c === "/" && this.peekNext() === "/") {
      while (!this.isAtEnd() && this.peek() !== "\n") this.advance();
      return;
    }

    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    if (isAlpha(c)) {
      this.scanIdentifierOrKeyword(startLine, startColumn, startPos);
      return;
    }

    if (isDigit(c)) {
      this.scanNumber(startLine, startColumn, startPos);
      return;
    }

    if (c === '"') {
      this.scanString(startLine, startColumn, startPos);
      return;
    }

    this.advance();
    switch (c) {
      case "+":
        this.addToken("Plus", startLine, startColumn, startPos);
        return;
      case "-":
        this.addToken("Minus", startLine, startColumn, startPos);
        return;
      case "*":
        this.addToken("Star", startLine, startColumn, startPos);
        return;
      case "/":
        this.addToken("Slash", startLine, startColumn, startPos);
        return;
      case "{":
        this.addToken("LBrace", startLine, startColumn, startPos);
        return;
      case "}":
        this.addToken("RBrace", startLine, startColumn, startPos);
        return;
      case "(":
        this.addToken("LParen", startLine, startColumn, startPos);
        return;
      case ")":
        this.addToken("RParen", startLine, startColumn, startPos);
        return;
      case ":":
        this.addToken("Colon", startLine, startColumn, startPos);
        return;
      case ",":
        this.addToken("Comma", startLine, startColumn, startPos);
        return;
      case ">":
        this.addToken(this.match("=") ? "GreaterEqual" : "Greater", startLine, startColumn, startPos);
        return;
      case "<":
        this.addToken(this.match("=") ? "LessEqual" : "Less", startLine, startColumn, startPos);
        return;
      case "=":
        if (this.match("=")) {
          this.addToken("EqualEqual", startLine, startColumn, startPos);
        } else {
          this.reportError(`Illegal character '='. Did you mean '=='?`, startLine, startColumn, 1);
        }
        return;
      case "!":
        if (this.match("=")) {
          this.addToken("BangEqual", startLine, startColumn, startPos);
        } else {
          this.reportError(`Illegal character '!'. Did you mean '!='?`, startLine, startColumn, 1);
        }
        return;
      default:
        this.reportError(`Illegal character '${c}'`, startLine, startColumn, 1);
        return;
    }
  }

  private scanIdentifierOrKeyword(startLine: number, startColumn: number, startPos: number): void {
    while (isAlphaNumeric(this.peek())) this.advance();
    const lexeme = this.source.slice(startPos, this.pos);
    const kind = KEYWORDS.get(lexeme) ?? "Identifier";
    this.addToken(kind, startLine, startColumn, startPos);
  }

  private scanNumber(startLine: number, startColumn: number, startPos: number): void {
    while (isDigit(this.peek())) this.advance();

    if (this.peek() === ".") {
      if (isDigit(this.peekNext())) {
        this.advance();
        while (isDigit(this.peek())) this.advance();
      } else {
        this.advance();
        const lexeme = this.source.slice(startPos, this.pos);
        this.reportError(
          `Malformed numeric literal '${lexeme}': expected at least one digit after '.'`,
          startLine,
          startColumn,
          this.pos - startPos
        );
        this.addToken("NumberLiteral", startLine, startColumn, startPos);
        return;
      }
    }

    this.addToken("NumberLiteral", startLine, startColumn, startPos);
  }

  private scanString(startLine: number, startColumn: number, startPos: number): void {
    this.advance(); // consume opening quote
    while (!this.isAtEnd() && this.peek() !== '"' && this.peek() !== "\n") {
      this.advance();
    }

    if (this.isAtEnd() || this.peek() === "\n") {
      const lexeme = this.source.slice(startPos, this.pos);
      this.reportError(
        `Unterminated string literal starting at '${lexeme}'`,
        startLine,
        startColumn,
        this.pos - startPos
      );
      this.addToken("StringLiteral", startLine, startColumn, startPos);
      return;
    }

    this.advance(); // consume closing quote
    this.addToken("StringLiteral", startLine, startColumn, startPos);
  }
}
