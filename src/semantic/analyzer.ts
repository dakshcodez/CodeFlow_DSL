import type { CompilerError } from "../diagnostics/diagnostics.js";
import { SymbolTable } from "../symbols/symbolTable.js";
import type {
  ActionStatement,
  BinaryExpr,
  Expr,
  IdentifierExpr,
  OtherwiseStatement,
  PrimitiveType,
  Program,
  SourceLocation,
  Statement,
  UnaryExpr,
  WhenStatement,
  WorkflowDecl,
} from "../ast/nodes.js";

export interface SemanticResult {
  errors: CompilerError[];
  symbolTables: SymbolTable[];
  /** Resolved type of every expression that type-checked without error. */
  types: Map<Expr, PrimitiveType>;
}

const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/"]);
const RELATIONAL_OPERATORS = new Set([">", "<", ">=", "<="]);
const EQUALITY_OPERATORS = new Set(["==", "!="]);
const LOGICAL_OPERATORS = new Set(["AND", "OR"]);

/**
 * Walks the AST produced by the parser, populating one SymbolTable per
 * workflow and checking declaration, scope, and type rules that a
 * context-free grammar cannot express. Semantic errors do not stop the
 * walk: analysis continues so that multiple diagnostics can be reported
 * in one pass, mirroring the parser's recovery behavior.
 */
class SemanticAnalyzer {
  private readonly errors: CompilerError[] = [];
  private readonly symbolTables: SymbolTable[] = [];
  private readonly types = new Map<Expr, PrimitiveType>();

  analyze(program: Program): SemanticResult {
    for (const workflow of program.workflows) {
      this.analyzeWorkflow(workflow);
    }
    return { errors: this.errors, symbolTables: this.symbolTables, types: this.types };
  }

  private analyzeWorkflow(workflow: WorkflowDecl): void {
    const table = new SymbolTable(workflow.name);
    this.symbolTables.push(table);

    for (const decl of workflow.declarations) {
      const inserted = table.insert({
        name: decl.name,
        kind: decl.declKind,
        type: decl.type,
        loc: decl.loc,
      });
      if (!inserted) {
        this.report(decl.loc, `Duplicate declaration of '${decl.name}' in workflow "${workflow.name}"`);
      }
    }

    for (const statement of workflow.statements) {
      this.analyzeStatement(statement, table);
    }
  }

  private analyzeStatement(statement: Statement, table: SymbolTable): void {
    switch (statement.kind) {
      case "WhenStatement":
        this.analyzeWhen(statement, table);
        return;
      case "OtherwiseStatement":
        this.analyzeOtherwise(statement, table);
        return;
      case "ActionStatement":
        this.analyzeAction(statement, table);
        return;
      case "AlertStatement":
      case "LogStatement":
        // Messages are string literals fixed by the grammar; nothing to check.
        return;
    }
  }

  private analyzeWhen(statement: WhenStatement, table: SymbolTable): void {
    const conditionType = this.analyzeExpr(statement.condition, table);
    if (conditionType !== undefined && conditionType !== "boolean") {
      this.report(
        statement.condition.loc,
        `The condition of a 'when' statement must be of type 'boolean', but found '${conditionType}'`
      );
    }
    for (const inner of statement.body) {
      this.analyzeStatement(inner, table);
    }
  }

  private analyzeOtherwise(statement: OtherwiseStatement, table: SymbolTable): void {
    for (const inner of statement.body) {
      this.analyzeStatement(inner, table);
    }
  }

  private analyzeAction(statement: ActionStatement, table: SymbolTable): void {
    // Action names are external dispatch targets, not declared identifiers,
    // so only the argument expressions are checked.
    for (const arg of statement.args) {
      this.analyzeExpr(arg, table);
    }
  }

  private analyzeExpr(expr: Expr, table: SymbolTable): PrimitiveType | undefined {
    let type: PrimitiveType | undefined;
    switch (expr.kind) {
      case "LiteralExpr":
        type = expr.literalType;
        break;
      case "IdentifierExpr":
        type = this.analyzeIdentifier(expr, table);
        break;
      case "UnaryExpr":
        type = this.analyzeUnary(expr, table);
        break;
      case "BinaryExpr":
        type = this.analyzeBinary(expr, table);
        break;
    }
    if (type !== undefined) this.types.set(expr, type);
    return type;
  }

  private analyzeIdentifier(expr: IdentifierExpr, table: SymbolTable): PrimitiveType | undefined {
    const symbol = table.lookup(expr.name);
    if (!symbol) {
      this.report(expr.loc, `Undefined identifier '${expr.name}'`);
      return undefined;
    }
    return symbol.type;
  }

  private analyzeUnary(expr: UnaryExpr, table: SymbolTable): PrimitiveType | undefined {
    const operandType = this.analyzeExpr(expr.operand, table);
    if (operandType === undefined) return undefined;

    const expected: PrimitiveType = expr.operator === "-" ? "number" : "boolean";
    if (operandType !== expected) {
      this.report(
        expr.loc,
        `Unary '${expr.operator}' requires an operand of type '${expected}', but found '${operandType}'`
      );
      return undefined;
    }
    return expected;
  }

  private analyzeBinary(expr: BinaryExpr, table: SymbolTable): PrimitiveType | undefined {
    const leftType = this.analyzeExpr(expr.left, table);
    const rightType = this.analyzeExpr(expr.right, table);
    if (leftType === undefined || rightType === undefined) return undefined;

    const op = expr.operator;

    if (ARITHMETIC_OPERATORS.has(op)) {
      if (leftType !== "number" || rightType !== "number") {
        this.reportBinaryTypeError(expr, "operands of type 'number, number'", leftType, rightType);
        return undefined;
      }
      return "number";
    }

    if (RELATIONAL_OPERATORS.has(op)) {
      if (leftType !== "number" || rightType !== "number") {
        this.reportBinaryTypeError(expr, "operands of type 'number, number'", leftType, rightType);
        return undefined;
      }
      return "boolean";
    }

    if (EQUALITY_OPERATORS.has(op)) {
      if (leftType !== rightType) {
        this.reportBinaryTypeError(expr, "two operands of the same type", leftType, rightType);
        return undefined;
      }
      return "boolean";
    }

    // LOGICAL_OPERATORS: "AND" | "OR"
    if (leftType !== "boolean" || rightType !== "boolean") {
      this.reportBinaryTypeError(expr, "operands of type 'boolean, boolean'", leftType, rightType);
      return undefined;
    }
    return "boolean";
  }

  private reportBinaryTypeError(
    expr: BinaryExpr,
    expected: string,
    leftType: PrimitiveType,
    rightType: PrimitiveType
  ): void {
    this.report(
      expr.loc,
      `Operator '${expr.operator}' expects ${expected}, but found '${leftType}' and '${rightType}'`
    );
  }

  private report(loc: SourceLocation, message: string): void {
    this.errors.push({ stage: "semantic", message, line: loc.line, column: loc.column });
  }
}

export function analyze(program: Program): SemanticResult {
  return new SemanticAnalyzer().analyze(program);
}
