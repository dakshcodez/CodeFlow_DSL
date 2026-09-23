import type { CompilerError } from "../diagnostics/diagnostics.js";
import type { Token } from "../lexer/token.js";
import type { TokenKind } from "../lexer/tokenKind.js";
import type {
  ActionStatement,
  AlertStatement,
  BinaryOperator,
  Declaration,
  Expr,
  LogStatement,
  OtherwiseStatement,
  PrimitiveType,
  Program,
  SourceLocation,
  Statement,
  WhenStatement,
  WorkflowDecl,
} from "../ast/nodes.js";

export interface ParseResult {
  program: Program;
  errors: CompilerError[];
}

const RELATIONAL_OPERATORS: readonly TokenKind[] = [
  "Greater",
  "Less",
  "GreaterEqual",
  "LessEqual",
  "EqualEqual",
  "BangEqual",
];

const STATEMENT_START_KINDS: readonly TokenKind[] = ["When", "Otherwise", "Action", "Alert", "Log"];

class ParseError extends Error {}

/**
 * Hand-written recursive-descent parser for CodeFlow.
 *
 * Each grammar production in the Phase 1 EBNF specification corresponds to
 * one parsing method below. The parser validates syntax and builds the
 * preliminary AST; it performs no semantic or type checking (Phase 2).
 */
export class Parser {
  private readonly tokens: readonly Token[];
  private pos = 0;
  private readonly errors: CompilerError[] = [];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  parse(): ParseResult {
    const workflows: WorkflowDecl[] = [];
    while (!this.isAtEnd()) {
      try {
        workflows.push(this.parseWorkflow());
      } catch (err) {
        if (err instanceof ParseError) {
          this.synchronizeToWorkflow();
        } else {
          throw err;
        }
      }
    }
    return { program: { kind: "Program", workflows }, errors: this.errors };
  }

  // ---- program / workflowDecl ---------------------------------------

  private parseWorkflow(): WorkflowDecl {
    const workflowTok = this.consume("Workflow", "'workflow'");
    const nameTok = this.consume("StringLiteral", "a workflow name as a string literal");
    this.consume("LBrace", `'{' to begin the body of workflow ${nameTok.lexeme}`);

    const declarations: Declaration[] = [];
    while (this.check("Sensor") || this.check("Input")) {
      declarations.push(this.parseDeclaration());
    }

    const statements = this.parseStatementsUntilRBrace();

    this.consume("RBrace", `'}' to close the body of workflow ${nameTok.lexeme}`);

    return {
      kind: "Workflow",
      name: this.stripQuotes(nameTok.lexeme),
      declarations,
      statements,
      loc: this.tokenLoc(workflowTok),
    };
  }

  // ---- declaration ----------------------------------------------------

  private parseDeclaration(): Declaration {
    const kindTok = this.advance(); // 'sensor' or 'input', guaranteed by caller
    const declKind: "sensor" | "input" = kindTok.kind === "Sensor" ? "sensor" : "input";
    const nameTok = this.consume("Identifier", `an identifier after '${kindTok.lexeme}'`);
    this.consume("Colon", `':' after declared identifier '${nameTok.lexeme}'`);
    const type = this.parseType();
    return {
      kind: "Declaration",
      declKind,
      name: nameTok.lexeme,
      type,
      loc: this.tokenLoc(kindTok),
    };
  }

  private parseType(): PrimitiveType {
    if (this.match("NumberType")) return "number";
    if (this.match("StringType")) return "string";
    if (this.match("BooleanType")) return "boolean";
    throw this.error(
      this.peek(),
      `a type ('number', 'string', or 'boolean') but found ${this.describeToken(this.peek())}`
    );
  }

  // ---- statement --------------------------------------------------------

  private parseStatementsUntilRBrace(): Statement[] {
    const statements: Statement[] = [];
    while (!this.check("RBrace") && !this.isAtEnd()) {
      try {
        statements.push(this.parseStatement());
      } catch (err) {
        if (err instanceof ParseError) {
          this.synchronizeToStatement();
        } else {
          throw err;
        }
      }
    }
    return statements;
  }

  private parseBlock(): Statement[] {
    this.consume("LBrace", "'{' to begin a block");
    const statements = this.parseStatementsUntilRBrace();
    this.consume("RBrace", "'}' to close a block");
    return statements;
  }

  private parseStatement(): Statement {
    switch (this.peek().kind) {
      case "When":
        return this.parseWhen();
      case "Otherwise":
        return this.parseOtherwise();
      case "Action":
        return this.parseAction();
      case "Alert":
        return this.parseAlert();
      case "Log":
        return this.parseLog();
      default:
        throw this.error(
          this.peek(),
          `a statement ('when', 'otherwise', 'action', 'alert', or 'log') but found ${this.describeToken(
            this.peek()
          )}`
        );
    }
  }

  private parseWhen(): WhenStatement {
    const tok = this.consume("When", "'when'");
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return { kind: "WhenStatement", condition, body, loc: this.tokenLoc(tok) };
  }

  private parseOtherwise(): OtherwiseStatement {
    const tok = this.consume("Otherwise", "'otherwise'");
    const body = this.parseBlock();
    return { kind: "OtherwiseStatement", body, loc: this.tokenLoc(tok) };
  }

  private parseAction(): ActionStatement {
    const tok = this.consume("Action", "'action'");
    const nameTok = this.consume("Identifier", "an action name");
    this.consume("LParen", `'(' after action name '${nameTok.lexeme}'`);
    const args: Expr[] = [];
    if (!this.check("RParen")) {
      args.push(this.parseExpression());
      while (this.match("Comma")) {
        args.push(this.parseExpression());
      }
    }
    this.consume("RParen", `')' to close the argument list of action '${nameTok.lexeme}'`);
    return { kind: "ActionStatement", name: nameTok.lexeme, args, loc: this.tokenLoc(tok) };
  }

  private parseAlert(): AlertStatement {
    const tok = this.consume("Alert", "'alert'");
    const msgTok = this.consume("StringLiteral", "a string literal message after 'alert'");
    return { kind: "AlertStatement", message: this.stripQuotes(msgTok.lexeme), loc: this.tokenLoc(tok) };
  }

  private parseLog(): LogStatement {
    const tok = this.consume("Log", "'log'");
    const msgTok = this.consume("StringLiteral", "a string literal message after 'log'");
    return { kind: "LogStatement", message: this.stripQuotes(msgTok.lexeme), loc: this.tokenLoc(tok) };
  }

  // ---- expression (precedence climbing via layered productions) --------

  private parseExpression(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.match("Or")) {
      const right = this.parseAnd();
      left = { kind: "BinaryExpr", operator: "OR", left, right, loc: left.loc };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.match("And")) {
      const right = this.parseNot();
      left = { kind: "BinaryExpr", operator: "AND", left, right, loc: left.loc };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.match("Not")) {
      const tok = this.previous();
      const operand = this.parseRelational();
      return { kind: "UnaryExpr", operator: "NOT", operand, loc: this.tokenLoc(tok) };
    }
    return this.parseRelational();
  }

  private parseRelational(): Expr {
    const left = this.parseAdditive();
    if (this.matchAny(RELATIONAL_OPERATORS)) {
      const opTok = this.previous();
      const right = this.parseAdditive();
      return {
        kind: "BinaryExpr",
        operator: this.relationalOperatorFor(opTok.kind),
        left,
        right,
        loc: left.loc,
      };
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.match("Plus") || this.match("Minus")) {
      const opTok = this.previous();
      const right = this.parseMultiplicative();
      left = { kind: "BinaryExpr", operator: opTok.kind === "Plus" ? "+" : "-", left, right, loc: left.loc };
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (this.match("Star") || this.match("Slash")) {
      const opTok = this.previous();
      const right = this.parseUnary();
      left = { kind: "BinaryExpr", operator: opTok.kind === "Star" ? "*" : "/", left, right, loc: left.loc };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.match("Minus")) {
      const tok = this.previous();
      const operand = this.parsePrimary();
      return { kind: "UnaryExpr", operator: "-", operand, loc: this.tokenLoc(tok) };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    if (this.match("NumberLiteral")) {
      const tok = this.previous();
      return {
        kind: "LiteralExpr",
        literalType: "number",
        value: Number.parseFloat(tok.lexeme),
        loc: this.tokenLoc(tok),
      };
    }
    if (this.match("StringLiteral")) {
      const tok = this.previous();
      return {
        kind: "LiteralExpr",
        literalType: "string",
        value: this.stripQuotes(tok.lexeme),
        loc: this.tokenLoc(tok),
      };
    }
    if (this.match("True")) {
      const tok = this.previous();
      return { kind: "LiteralExpr", literalType: "boolean", value: true, loc: this.tokenLoc(tok) };
    }
    if (this.match("False")) {
      const tok = this.previous();
      return { kind: "LiteralExpr", literalType: "boolean", value: false, loc: this.tokenLoc(tok) };
    }
    if (this.match("Identifier")) {
      const tok = this.previous();
      return { kind: "IdentifierExpr", name: tok.lexeme, loc: this.tokenLoc(tok) };
    }
    if (this.match("LParen")) {
      const expr = this.parseExpression();
      this.consume("RParen", "')' to close the parenthesized expression");
      return expr;
    }
    throw this.error(this.peek(), `an expression but found ${this.describeToken(this.peek())}`);
  }

  private relationalOperatorFor(kind: TokenKind): BinaryOperator {
    switch (kind) {
      case "Greater":
        return ">";
      case "Less":
        return "<";
      case "GreaterEqual":
        return ">=";
      case "LessEqual":
        return "<=";
      case "EqualEqual":
        return "==";
      case "BangEqual":
        return "!=";
      default:
        throw new Error(`Unreachable relational operator token kind: ${kind}`);
    }
  }

  // ---- error recovery -----------------------------------------------------

  /**
   * Skips tokens until the next statement-start keyword or the closing
   * brace of the current block, tracking brace depth so that braces
   * belonging to a discarded nested block (e.g. an unparsable `when`
   * condition) are not mistaken for the enclosing block's own braces.
   */
  private synchronizeToStatement(): void {
    let depth = 0;
    while (!this.isAtEnd()) {
      const kind = this.peek().kind;
      if (depth === 0 && (kind === "RBrace" || STATEMENT_START_KINDS.includes(kind))) return;
      if (kind === "LBrace") depth++;
      else if (kind === "RBrace") depth--;
      this.advance();
    }
  }

  private synchronizeToWorkflow(): void {
    while (!this.isAtEnd()) {
      if (this.check("Workflow")) return;
      this.advance();
    }
  }

  // ---- token stream primitives -------------------------------------------

  private isAtEnd(): boolean {
    return this.peek().kind === "EOF";
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private previous(): Token {
    return this.tokens[this.pos - 1]!;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }

  private check(kind: TokenKind): boolean {
    return !this.isAtEnd() && this.peek().kind === kind;
  }

  private match(kind: TokenKind): boolean {
    if (!this.check(kind)) return false;
    this.advance();
    return true;
  }

  private matchAny(kinds: readonly TokenKind[]): boolean {
    if (!kinds.includes(this.peek().kind)) return false;
    this.advance();
    return true;
  }

  private consume(kind: TokenKind, expectedDescription: string): Token {
    if (this.check(kind)) return this.advance();
    throw this.error(this.peek(), `${expectedDescription} but found ${this.describeToken(this.peek())}`);
  }

  private describeToken(token: Token): string {
    return token.kind === "EOF" ? "end of input" : `'${token.lexeme}'`;
  }

  private error(token: Token, message: string): ParseError {
    this.errors.push({
      stage: "syntax",
      message: `Expected ${message}`,
      line: token.line,
      column: token.column,
      length: token.lexeme.length || 1,
    });
    return new ParseError(message);
  }

  private tokenLoc(token: Token): SourceLocation {
    return { line: token.line, column: token.column };
  }

  private stripQuotes(lexeme: string): string {
    let s = lexeme;
    if (s.startsWith('"')) s = s.slice(1);
    if (s.endsWith('"')) s = s.slice(0, -1);
    return s;
  }
}
