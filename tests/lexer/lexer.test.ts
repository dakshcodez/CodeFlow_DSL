import { describe, expect, it } from "vitest";
import { Lexer } from "../../src/lexer/lexer.js";
import type { TokenKind } from "../../src/lexer/tokenKind.js";

function kinds(source: string): TokenKind[] {
  return new Lexer(source).tokenize().tokens.map((t) => t.kind);
}

describe("Lexer", () => {
  it("tokenizes all reserved keywords", () => {
    const source =
      "workflow sensor input when otherwise action alert log number string boolean AND OR NOT true false";
    expect(kinds(source)).toEqual([
      "Workflow",
      "Sensor",
      "Input",
      "When",
      "Otherwise",
      "Action",
      "Alert",
      "Log",
      "NumberType",
      "StringType",
      "BooleanType",
      "And",
      "Or",
      "Not",
      "True",
      "False",
      "EOF",
    ]);
  });

  it("tokenizes identifiers, including those starting with underscore", () => {
    const source = "temperature _sensor1 order_amount";
    const tokens = new Lexer(source).tokenize().tokens;
    expect(tokens.slice(0, 3).map((t) => [t.kind, t.lexeme])).toEqual([
      ["Identifier", "temperature"],
      ["Identifier", "_sensor1"],
      ["Identifier", "order_amount"],
    ]);
  });

  it("does not treat a keyword-prefixed identifier as a keyword", () => {
    const tokens = new Lexer("whenever").tokenize().tokens;
    expect(tokens[0]).toMatchObject({ kind: "Identifier", lexeme: "whenever" });
  });

  it("tokenizes integer and decimal number literals", () => {
    const tokens = new Lexer("35 10000 2.5").tokenize().tokens;
    expect(tokens.slice(0, 3).map((t) => [t.kind, t.lexeme])).toEqual([
      ["NumberLiteral", "35"],
      ["NumberLiteral", "10000"],
      ["NumberLiteral", "2.5"],
    ]);
  });

  it("tokenizes string literals", () => {
    const tokens = new Lexer('"High temperature"').tokenize().tokens;
    expect(tokens[0]).toMatchObject({ kind: "StringLiteral", lexeme: '"High temperature"' });
  });

  it("tokenizes boolean literals as keywords", () => {
    expect(kinds("true false")).toEqual(["True", "False", "EOF"]);
  });

  it("tokenizes arithmetic, relational, and grouping operators", () => {
    const source = "+ - * / > < >= <= == != { } ( ) : ,";
    expect(kinds(source)).toEqual([
      "Plus",
      "Minus",
      "Star",
      "Slash",
      "Greater",
      "Less",
      "GreaterEqual",
      "LessEqual",
      "EqualEqual",
      "BangEqual",
      "LBrace",
      "RBrace",
      "LParen",
      "RParen",
      "Colon",
      "Comma",
      "EOF",
    ]);
  });

  it("skips whitespace between tokens", () => {
    const tokens = new Lexer("  temperature  \t\n  35  ").tokenize().tokens;
    expect(tokens.map((t) => t.kind)).toEqual(["Identifier", "NumberLiteral", "EOF"]);
  });

  it("reports an illegal character and continues lexing", () => {
    const { tokens, errors } = new Lexer("temperature @ 35").tokenize();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ stage: "lexical", line: 1, column: 13 });
    expect(tokens.map((t) => t.kind)).toEqual(["Identifier", "NumberLiteral", "EOF"]);
  });

  it("reports a malformed numeric literal with a trailing dot", () => {
    const { errors, tokens } = new Lexer("35.").tokenize();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/Malformed numeric literal/);
    expect(tokens[0]).toMatchObject({ kind: "NumberLiteral", lexeme: "35." });
  });

  it("reports an unterminated string literal", () => {
    const { errors, tokens } = new Lexer('"High temperature').tokenize();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/Unterminated string literal/);
    expect(tokens[0]).toMatchObject({ kind: "StringLiteral" });
  });

  it("tracks line and column positions across newlines", () => {
    const tokens = new Lexer("workflow\n  temperature").tokenize().tokens;
    expect(tokens[0]).toMatchObject({ line: 1, column: 1 });
    expect(tokens[1]).toMatchObject({ line: 2, column: 3 });
  });
});
