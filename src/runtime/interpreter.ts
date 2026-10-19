import type { BinaryOperator, SourceLocation, UnaryOperator } from "../ast/nodes.js";
import type { CompilerError } from "../diagnostics/diagnostics.js";
import type { IRInstruction, Operand, WorkflowIR } from "../ir/instructions.js";
import { SymbolTable } from "../symbols/symbolTable.js";

export type RuntimeValue = number | string | boolean;

/** Sensor/input values supplied at execution time. CodeFlow has no real
 * physical sensors or actuators; the caller supplies these directly. */
export type RuntimeInputs = Readonly<Record<string, RuntimeValue>>;

export type RuntimeEffect =
  | { kind: "Alert"; message: string }
  | { kind: "Log"; message: string }
  | { kind: "Action"; name: string; args: RuntimeValue[] };

export interface WorkflowExecutionResult {
  workflowName: string;
  trace: RuntimeEffect[];
  errors: CompilerError[];
}

class RuntimeError extends Error {
  constructor(public readonly detail: { message: string; line?: number; column?: number }) {
    super(detail.message);
  }
}

function runtimeError(message: string, loc?: SourceLocation): RuntimeError {
  return new RuntimeError({ message, line: loc?.line, column: loc?.column });
}

function tempId(operand: Operand, loc?: SourceLocation): number {
  if (operand.kind !== "Temp") {
    throw runtimeError("Internal error: expected a temporary instruction destination", loc);
  }
  return operand.id;
}

function typeMismatch(operator: string, left: RuntimeValue, right: RuntimeValue, loc?: SourceLocation): RuntimeError {
  return runtimeError(`Operator '${operator}' cannot be applied to '${typeof left}' and '${typeof right}'`, loc);
}

function evaluateBinary(operator: BinaryOperator, left: RuntimeValue, right: RuntimeValue, loc?: SourceLocation): RuntimeValue {
  const bothNumbers = typeof left === "number" && typeof right === "number";
  switch (operator) {
    case "+":
      if (!bothNumbers) throw typeMismatch(operator, left, right, loc);
      return (left as number) + (right as number);
    case "-":
      if (!bothNumbers) throw typeMismatch(operator, left, right, loc);
      return (left as number) - (right as number);
    case "*":
      if (!bothNumbers) throw typeMismatch(operator, left, right, loc);
      return (left as number) * (right as number);
    case "/":
      if (!bothNumbers) throw typeMismatch(operator, left, right, loc);
      if ((right as number) === 0) throw runtimeError("Division by zero", loc);
      return (left as number) / (right as number);
    case ">":
      if (!bothNumbers) throw typeMismatch(operator, left, right, loc);
      return (left as number) > (right as number);
    case "<":
      if (!bothNumbers) throw typeMismatch(operator, left, right, loc);
      return (left as number) < (right as number);
    case ">=":
      if (!bothNumbers) throw typeMismatch(operator, left, right, loc);
      return (left as number) >= (right as number);
    case "<=":
      if (!bothNumbers) throw typeMismatch(operator, left, right, loc);
      return (left as number) <= (right as number);
    case "==":
      if (typeof left !== typeof right) throw typeMismatch(operator, left, right, loc);
      return left === right;
    case "!=":
      if (typeof left !== typeof right) throw typeMismatch(operator, left, right, loc);
      return left !== right;
    case "AND":
      if (typeof left !== "boolean" || typeof right !== "boolean") throw typeMismatch(operator, left, right, loc);
      return left && right;
    case "OR":
      if (typeof left !== "boolean" || typeof right !== "boolean") throw typeMismatch(operator, left, right, loc);
      return left || right;
  }
}

function evaluateUnary(operator: UnaryOperator, operand: RuntimeValue, loc?: SourceLocation): RuntimeValue {
  if (operator === "-") {
    if (typeof operand !== "number") throw runtimeError(`Unary '-' cannot be applied to '${typeof operand}'`, loc);
    return -operand;
  }
  if (typeof operand !== "boolean") throw runtimeError(`'NOT' cannot be applied to '${typeof operand}'`, loc);
  return !operand;
}

/**
 * Interprets one workflow's (ideally optimized) TAC against a fixed set
 * of runtime sensor/input values. Execution halts and records a single
 * `"runtime"`-stage CompilerError on the first runtime error (an
 * undeclared/missing input, a declared-vs-supplied type mismatch, or
 * division by zero); whatever trace was produced up to that point is
 * still returned.
 */
export function executeWorkflow(
  workflowIR: WorkflowIR,
  runtimeInputs: RuntimeInputs,
  symbolTable: SymbolTable
): WorkflowExecutionResult {
  const trace: RuntimeEffect[] = [];
  const errors: CompilerError[] = [];
  const temps = new Map<number, RuntimeValue>();

  const labelIndex = new Map<string, number>();
  workflowIR.instructions.forEach((instr, i) => {
    if (instr.kind === "Label") labelIndex.set(instr.label, i);
  });

  function jumpTarget(label: string, loc?: SourceLocation): number {
    const target = labelIndex.get(label);
    if (target === undefined) throw runtimeError(`Internal error: unknown label '${label}'`, loc);
    return target;
  }

  function resolve(operand: Operand, loc?: SourceLocation): RuntimeValue {
    if (operand.kind === "Const") return operand.value;

    if (operand.kind === "Temp") {
      const value = temps.get(operand.id);
      if (value === undefined) {
        throw runtimeError(`Internal error: temporary t${operand.id} was never assigned`, loc);
      }
      return value;
    }

    const provided = runtimeInputs[operand.name];
    if (provided === undefined) {
      throw runtimeError(`No runtime value provided for '${operand.name}'`, loc);
    }
    const symbol = symbolTable.lookup(operand.name);
    if (symbol && typeof provided !== symbol.type) {
      throw runtimeError(
        `Type mismatch for '${operand.name}': expected ${symbol.type} but received ${typeof provided} (${JSON.stringify(provided)})`,
        loc
      );
    }
    return provided;
  }

  let pc = 0;
  try {
    while (pc < workflowIR.instructions.length) {
      const instr: IRInstruction = workflowIR.instructions[pc]!;
      switch (instr.kind) {
        case "Assign":
          temps.set(tempId(instr.dest, instr.loc), resolve(instr.value, instr.loc));
          pc++;
          break;

        case "Binary": {
          const left = resolve(instr.left, instr.loc);
          const right = resolve(instr.right, instr.loc);
          temps.set(tempId(instr.dest, instr.loc), evaluateBinary(instr.operator, left, right, instr.loc));
          pc++;
          break;
        }

        case "Unary": {
          const operand = resolve(instr.operand, instr.loc);
          temps.set(tempId(instr.dest, instr.loc), evaluateUnary(instr.operator, operand, instr.loc));
          pc++;
          break;
        }

        case "IfFalse": {
          const condition = resolve(instr.condition, instr.loc);
          pc = condition === false ? jumpTarget(instr.label, instr.loc) : pc + 1;
          break;
        }

        case "Goto":
          pc = jumpTarget(instr.label, instr.loc);
          break;

        case "Label":
          pc++;
          break;

        case "Call": {
          const args = instr.args.map((arg) => resolve(arg, instr.loc));
          trace.push({ kind: "Action", name: instr.name, args });
          pc++;
          break;
        }

        case "Alert":
          trace.push({ kind: "Alert", message: instr.message });
          pc++;
          break;

        case "Log":
          trace.push({ kind: "Log", message: instr.message });
          pc++;
          break;
      }
    }
  } catch (err) {
    if (err instanceof RuntimeError) {
      errors.push({ stage: "runtime", ...err.detail });
    } else {
      throw err;
    }
  }

  return { workflowName: workflowIR.workflowName, trace, errors };
}

export function execute(
  programIR: readonly WorkflowIR[],
  runtimeInputs: RuntimeInputs,
  symbolTables: readonly SymbolTable[]
): WorkflowExecutionResult[] {
  return programIR.map((workflowIR) => {
    const table =
      symbolTables.find((t) => t.scope === workflowIR.workflowName) ?? new SymbolTable(workflowIR.workflowName);
    return executeWorkflow(workflowIR, runtimeInputs, table);
  });
}

export function formatEffect(effect: RuntimeEffect): string {
  switch (effect.kind) {
    case "Alert":
      return `ALERT: ${effect.message}`;
    case "Log":
      return `LOG: ${effect.message}`;
    case "Action":
      return `ACTION: ${effect.name}(${effect.args.map((a) => JSON.stringify(a)).join(", ")})`;
  }
}
