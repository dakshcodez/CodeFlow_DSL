import type { BinaryOperator, SourceLocation, UnaryOperator } from "../ast/nodes.js";

/**
 * A TAC operand. `Temp` names a compiler-generated temporary; `Var` names
 * a declared sensor/input; `Const` is a literal value. The generator in
 * `generator.ts` always materializes `Var` and `Const` operands into a
 * `Temp` via an AssignInstruction before using them in a computation, so
 * that instructions never reference more than one operator's worth of
 * work (true three-address discipline).
 */
export type Operand =
  | { readonly kind: "Temp"; readonly id: number }
  | { readonly kind: "Var"; readonly name: string }
  | { readonly kind: "Const"; readonly value: number | string | boolean };

export interface AssignInstruction {
  kind: "Assign";
  dest: Operand;
  value: Operand;
  loc?: SourceLocation;
}

export interface BinaryInstruction {
  kind: "Binary";
  operator: BinaryOperator;
  dest: Operand;
  left: Operand;
  right: Operand;
  loc?: SourceLocation;
}

export interface UnaryInstruction {
  kind: "Unary";
  operator: UnaryOperator;
  dest: Operand;
  operand: Operand;
  loc?: SourceLocation;
}

/** Jumps to `label` if `condition` is falsy; falls through otherwise. */
export interface ConditionalJumpInstruction {
  kind: "IfFalse";
  condition: Operand;
  label: string;
  loc?: SourceLocation;
}

export interface JumpInstruction {
  kind: "Goto";
  label: string;
  loc?: SourceLocation;
}

export interface LabelInstruction {
  kind: "Label";
  label: string;
}

export interface CallInstruction {
  kind: "Call";
  name: string;
  args: Operand[];
  loc?: SourceLocation;
}

export interface AlertInstruction {
  kind: "Alert";
  message: string;
  loc?: SourceLocation;
}

export interface LogInstruction {
  kind: "Log";
  message: string;
  loc?: SourceLocation;
}

export type IRInstruction =
  | AssignInstruction
  | BinaryInstruction
  | UnaryInstruction
  | ConditionalJumpInstruction
  | JumpInstruction
  | LabelInstruction
  | CallInstruction
  | AlertInstruction
  | LogInstruction;

/** The TAC instruction sequence generated for a single workflow. */
export interface WorkflowIR {
  workflowName: string;
  instructions: IRInstruction[];
}
