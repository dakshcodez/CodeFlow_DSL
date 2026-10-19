import type { BinaryOperator, UnaryOperator } from "../ast/nodes.js";
import type { IRInstruction, Operand, WorkflowIR } from "../ir/instructions.js";

type ConstValue = number | string | boolean;
type EvalResult = { ok: true; value: ConstValue } | { ok: false };

function evaluateBinary(operator: BinaryOperator, left: ConstValue, right: ConstValue): EvalResult {
  const bothNumbers = typeof left === "number" && typeof right === "number";
  switch (operator) {
    case "+":
      return bothNumbers ? { ok: true, value: (left as number) + (right as number) } : { ok: false };
    case "-":
      return bothNumbers ? { ok: true, value: (left as number) - (right as number) } : { ok: false };
    case "*":
      return bothNumbers ? { ok: true, value: (left as number) * (right as number) } : { ok: false };
    case "/":
      // Division by a constant zero is left unfolded so the (future) execution
      // engine's runtime-error handling applies uniformly, instead of the
      // optimizer silently producing Infinity/NaN as a "constant".
      return bothNumbers && (right as number) !== 0
        ? { ok: true, value: (left as number) / (right as number) }
        : { ok: false };
    case ">":
      return bothNumbers ? { ok: true, value: (left as number) > (right as number) } : { ok: false };
    case "<":
      return bothNumbers ? { ok: true, value: (left as number) < (right as number) } : { ok: false };
    case ">=":
      return bothNumbers ? { ok: true, value: (left as number) >= (right as number) } : { ok: false };
    case "<=":
      return bothNumbers ? { ok: true, value: (left as number) <= (right as number) } : { ok: false };
    case "==":
      return typeof left === typeof right ? { ok: true, value: left === right } : { ok: false };
    case "!=":
      return typeof left === typeof right ? { ok: true, value: left !== right } : { ok: false };
    case "AND":
      return typeof left === "boolean" && typeof right === "boolean"
        ? { ok: true, value: left && right }
        : { ok: false };
    case "OR":
      return typeof left === "boolean" && typeof right === "boolean"
        ? { ok: true, value: left || right }
        : { ok: false };
  }
}

function evaluateUnary(operator: UnaryOperator, operand: ConstValue): EvalResult {
  if (operator === "-") {
    return typeof operand === "number" ? { ok: true, value: -operand } : { ok: false };
  }
  return typeof operand === "boolean" ? { ok: true, value: !operand } : { ok: false };
}

function constOperandValue(operand: Operand, known: ReadonlyMap<number, ConstValue>): ConstValue | undefined {
  if (operand.kind === "Const") return operand.value;
  if (operand.kind === "Temp") return known.get(operand.id);
  return undefined; // Var: a runtime sensor/input value, never known at compile time
}

/**
 * Folds Binary/Unary instructions whose operands are compile-time
 * constants into a single Assign. Constant knowledge is tracked per
 * temporary and reset at every Label, since a label is a control-flow
 * merge point that may be reached with different values than whatever
 * preceded it textually.
 */
export function foldConstants(instructions: readonly IRInstruction[]): IRInstruction[] {
  const result: IRInstruction[] = [];
  let known = new Map<number, ConstValue>();

  for (const instr of instructions) {
    switch (instr.kind) {
      case "Label":
        known = new Map();
        result.push(instr);
        break;

      case "Assign": {
        result.push(instr);
        if (instr.dest.kind === "Temp") {
          const value = constOperandValue(instr.value, known);
          if (value !== undefined) known.set(instr.dest.id, value);
          else known.delete(instr.dest.id);
        }
        break;
      }

      case "Binary": {
        const left = constOperandValue(instr.left, known);
        const right = constOperandValue(instr.right, known);
        const folded = left !== undefined && right !== undefined ? evaluateBinary(instr.operator, left, right) : { ok: false as const };
        if (folded.ok) {
          result.push({ kind: "Assign", dest: instr.dest, value: { kind: "Const", value: folded.value }, loc: instr.loc });
          if (instr.dest.kind === "Temp") known.set(instr.dest.id, folded.value);
        } else {
          result.push(instr);
          if (instr.dest.kind === "Temp") known.delete(instr.dest.id);
        }
        break;
      }

      case "Unary": {
        const operand = constOperandValue(instr.operand, known);
        const folded = operand !== undefined ? evaluateUnary(instr.operator, operand) : { ok: false as const };
        if (folded.ok) {
          result.push({ kind: "Assign", dest: instr.dest, value: { kind: "Const", value: folded.value }, loc: instr.loc });
          if (instr.dest.kind === "Temp") known.set(instr.dest.id, folded.value);
        } else {
          result.push(instr);
          if (instr.dest.kind === "Temp") known.delete(instr.dest.id);
        }
        break;
      }

      default:
        result.push(instr);
    }
  }

  return result;
}

/** The known-constants map immediately before each instruction executes. */
function snapshotConstantsBeforeEachInstruction(
  instructions: readonly IRInstruction[]
): ReadonlyMap<number, ConstValue>[] {
  const snapshots: ReadonlyMap<number, ConstValue>[] = [];
  let known = new Map<number, ConstValue>();
  for (const instr of instructions) {
    snapshots.push(known);
    if (instr.kind === "Label") {
      known = new Map();
    } else if (instr.kind === "Assign" && instr.dest.kind === "Temp") {
      const next = new Map(known);
      const value = constOperandValue(instr.value, known);
      if (value !== undefined) next.set(instr.dest.id, value);
      else next.delete(instr.dest.id);
      known = next;
    } else if ((instr.kind === "Binary" || instr.kind === "Unary") && instr.dest.kind === "Temp" && known.has(instr.dest.id)) {
      const next = new Map(known);
      next.delete(instr.dest.id);
      known = next;
    }
  }
  return snapshots;
}

/**
 * Removes instructions unreachable from the start of the sequence. Builds
 * a small control-flow graph over instruction indices (fallthrough to
 * `i + 1`, plus a jump edge for Goto/IfFalse) and keeps only what a
 * breadth-first search from index 0 reaches. When an IfFalse's condition
 * is a compile-time-known boolean (typically thanks to `foldConstants`
 * having run first), only the edge that condition can actually take is
 * included, which is what lets an always-true/always-false `when`
 * eliminate its unreachable branch.
 */
export function eliminateUnreachableCode(instructions: readonly IRInstruction[]): IRInstruction[] {
  const n = instructions.length;
  if (n === 0) return [];

  const labelIndex = new Map<string, number>();
  instructions.forEach((instr, i) => {
    if (instr.kind === "Label") labelIndex.set(instr.label, i);
  });

  const snapshots = snapshotConstantsBeforeEachInstruction(instructions);
  const reachable = new Array<boolean>(n).fill(false);
  const worklist: number[] = [0];

  while (worklist.length > 0) {
    const i = worklist.pop()!;
    if (i < 0 || i >= n || reachable[i]) continue;
    reachable[i] = true;

    const instr = instructions[i]!;
    if (instr.kind === "Goto") {
      const target = labelIndex.get(instr.label);
      if (target !== undefined) worklist.push(target);
      continue;
    }

    if (instr.kind === "IfFalse") {
      const known = snapshots[i]!;
      const condition = constOperandValue(instr.condition, known);
      const alwaysTrue = condition === true;
      const alwaysFalse = condition === false;
      if (!alwaysFalse) worklist.push(i + 1); // fallthrough: taken unless the jump is guaranteed
      if (!alwaysTrue) {
        const target = labelIndex.get(instr.label);
        if (target !== undefined) worklist.push(target);
      }
      continue;
    }

    worklist.push(i + 1);
  }

  return instructions.filter((_, i) => reachable[i]);
}

function markOperandsLive(instruction: IRInstruction, live: Set<number>): void {
  const mark = (operand: Operand): void => {
    if (operand.kind === "Temp") live.add(operand.id);
  };
  switch (instruction.kind) {
    case "Assign":
      mark(instruction.value);
      return;
    case "Binary":
      mark(instruction.left);
      mark(instruction.right);
      return;
    case "Unary":
      mark(instruction.operand);
      return;
    case "IfFalse":
      mark(instruction.condition);
      return;
    case "Call":
      instruction.args.forEach(mark);
      return;
    case "Goto":
    case "Label":
    case "Alert":
    case "Log":
      return;
  }
}

/**
 * Removes Assign/Binary/Unary instructions whose result temporary is
 * never used by a later instruction. A single backward pass suffices
 * (rather than an iterative fixed point) because CodeFlow has no loops:
 * every jump target is textually later than its jump, so the reverse
 * instruction order is already a valid reverse-topological order over
 * the control-flow graph, and each temporary has exactly one static
 * definition.
 */
export function eliminateDeadCode(instructions: readonly IRInstruction[]): IRInstruction[] {
  const live = new Set<number>();
  const kept: IRInstruction[] = [];

  for (let i = instructions.length - 1; i >= 0; i--) {
    const instr = instructions[i]!;
    const definesTemp = instr.kind === "Assign" || instr.kind === "Binary" || instr.kind === "Unary";

    if (definesTemp && instr.dest.kind === "Temp") {
      if (!live.has(instr.dest.id)) continue; // dead definition; drop it
      live.delete(instr.dest.id);
    }

    kept.push(instr);
    markOperandsLive(instr, live);
  }

  kept.reverse();
  return kept;
}

/** Applies constant folding, then unreachable-code elimination, then dead-code elimination. */
export function optimizeWorkflow(workflowIR: WorkflowIR): WorkflowIR {
  const folded = foldConstants(workflowIR.instructions);
  const reachable = eliminateUnreachableCode(folded);
  const instructions = eliminateDeadCode(reachable);
  return { workflowName: workflowIR.workflowName, instructions };
}

export function optimize(programIR: readonly WorkflowIR[]): WorkflowIR[] {
  return programIR.map(optimizeWorkflow);
}
