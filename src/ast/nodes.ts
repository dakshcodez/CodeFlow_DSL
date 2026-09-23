export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

export type PrimitiveType = "number" | "string" | "boolean";

export interface Program {
  kind: "Program";
  workflows: WorkflowDecl[];
}

export interface WorkflowDecl {
  kind: "Workflow";
  name: string;
  declarations: Declaration[];
  statements: Statement[];
  loc: SourceLocation;
}

export interface Declaration {
  kind: "Declaration";
  declKind: "sensor" | "input";
  name: string;
  type: PrimitiveType;
  loc: SourceLocation;
}

export type Statement =
  | WhenStatement
  | OtherwiseStatement
  | ActionStatement
  | AlertStatement
  | LogStatement;

export interface WhenStatement {
  kind: "WhenStatement";
  condition: Expr;
  body: Statement[];
  loc: SourceLocation;
}

export interface OtherwiseStatement {
  kind: "OtherwiseStatement";
  body: Statement[];
  loc: SourceLocation;
}

export interface ActionStatement {
  kind: "ActionStatement";
  name: string;
  args: Expr[];
  loc: SourceLocation;
}

export interface AlertStatement {
  kind: "AlertStatement";
  message: string;
  loc: SourceLocation;
}

export interface LogStatement {
  kind: "LogStatement";
  message: string;
  loc: SourceLocation;
}

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | ">"
  | "<"
  | ">="
  | "<="
  | "=="
  | "!="
  | "AND"
  | "OR";

export type UnaryOperator = "-" | "NOT";

export type Expr = LiteralExpr | IdentifierExpr | UnaryExpr | BinaryExpr;

export interface LiteralExpr {
  kind: "LiteralExpr";
  literalType: PrimitiveType;
  value: number | string | boolean;
  loc: SourceLocation;
}

export interface IdentifierExpr {
  kind: "IdentifierExpr";
  name: string;
  loc: SourceLocation;
}

export interface UnaryExpr {
  kind: "UnaryExpr";
  operator: UnaryOperator;
  operand: Expr;
  loc: SourceLocation;
}

export interface BinaryExpr {
  kind: "BinaryExpr";
  operator: BinaryOperator;
  left: Expr;
  right: Expr;
  loc: SourceLocation;
}
