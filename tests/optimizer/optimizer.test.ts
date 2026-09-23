import { describe, expect, it } from "vitest";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { generateIR } from "../../src/ir/generator.js";
import { formatInstruction } from "../../src/ir/print.js";
import {
  eliminateDeadCode,
  eliminateUnreachableCode,
  foldConstants,
  optimizeWorkflow,
} from "../../src/optimizer/optimizer.js";
import type { IRInstruction, Operand } from "../../src/ir/instructions.js";

const T = (id: number): Operand => ({ kind: "Temp", id });
const V = (name: string): Operand => ({ kind: "Var", name });
const C = (value: number | string | boolean): Operand => ({ kind: "Const", value });

function fmt(instrs: readonly IRInstruction[]): string[] {
  return instrs.map(formatInstruction);
}

/** Generates unoptimized TAC for a single workflow from CodeFlow source. */
function irFor(source: string) {
  const { tokens } = new Lexer(source).tokenize();
  const { program, errors } = new Parser(tokens).parse();
  expect(errors).toEqual([]);
  const ir = generateIR(program);
  expect(ir).toHaveLength(1);
  return ir[0]!;
}

describe("foldConstants", () => {
  it("folds arithmetic operators on number constants", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(10) },
      { kind: "Assign", dest: T(2), value: C(3) },
      { kind: "Binary", operator: "+", dest: T(3), left: T(1), right: T(2) },
      { kind: "Binary", operator: "-", dest: T(4), left: T(1), right: T(2) },
      { kind: "Binary", operator: "*", dest: T(5), left: T(1), right: T(2) },
      { kind: "Binary", operator: "/", dest: T(6), left: T(1), right: T(2) },
    ];
    const folded = foldConstants(instrs);
    expect(fmt(folded)).toEqual(["t1 = 10", "t2 = 3", "t3 = 13", "t4 = 7", "t5 = 30", "t6 = 3.3333333333333335"]);
  });

  it("folds relational and equality comparisons", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(5) },
      { kind: "Assign", dest: T(2), value: C(10) },
      { kind: "Binary", operator: ">", dest: T(3), left: T(1), right: T(2) },
      { kind: "Binary", operator: "<=", dest: T(4), left: T(1), right: T(2) },
      { kind: "Binary", operator: "==", dest: T(5), left: T(1), right: T(1) },
      { kind: "Assign", dest: T(6), value: C("a") },
      { kind: "Assign", dest: T(7), value: C("b") },
      { kind: "Binary", operator: "!=", dest: T(8), left: T(6), right: T(7) },
    ];
    const folded = foldConstants(instrs);
    expect(folded.filter((i) => i.kind === "Binary")).toEqual([]);
    expect(fmt(folded).slice(2)).toEqual(["t3 = false", "t4 = true", "t5 = true", 't6 = "a"', 't7 = "b"', "t8 = true"]);
  });

  it("folds logical AND/OR and unary NOT/minus", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(true) },
      { kind: "Assign", dest: T(2), value: C(false) },
      { kind: "Binary", operator: "AND", dest: T(3), left: T(1), right: T(2) },
      { kind: "Binary", operator: "OR", dest: T(4), left: T(1), right: T(2) },
      { kind: "Unary", operator: "NOT", dest: T(5), operand: T(1) },
      { kind: "Assign", dest: T(6), value: C(7) },
      { kind: "Unary", operator: "-", dest: T(7), operand: T(6) },
    ];
    expect(fmt(foldConstants(instrs)).slice(2)).toEqual(["t3 = false", "t4 = true", "t5 = false", "t6 = 7", "t7 = -7"]);
  });

  it("does not fold division by a constant zero", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(10) },
      { kind: "Assign", dest: T(2), value: C(0) },
      { kind: "Binary", operator: "/", dest: T(3), left: T(1), right: T(2) },
    ];
    expect(fmt(foldConstants(instrs))).toEqual(["t1 = 10", "t2 = 0", "t3 = t1 / t2"]);
  });

  it("does not fold an operand sourced from a Var (runtime sensor/input)", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: V("temperature") },
      { kind: "Assign", dest: T(2), value: C(35) },
      { kind: "Binary", operator: ">", dest: T(3), left: T(1), right: T(2) },
    ];
    expect(fmt(foldConstants(instrs))).toEqual(["t1 = temperature", "t2 = 35", "t3 = t1 > t2"]);
  });

  it("resets known constants at a Label, since it is a control-flow merge point", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(5) },
      { kind: "Label", label: "L1" },
      { kind: "Binary", operator: "+", dest: T(2), left: T(1), right: T(1) },
    ];
    // t1's constant value must not be assumed to still hold after the label.
    expect(fmt(foldConstants(instrs))).toEqual(["t1 = 5", "LABEL L1", "t2 = t1 + t1"]);
  });
});

describe("eliminateUnreachableCode", () => {
  it("keeps everything when no branch is statically resolvable", () => {
    const instrs: IRInstruction[] = [
      { kind: "IfFalse", condition: V("x"), label: "L1" },
      { kind: "Log", message: "a" },
      { kind: "Label", label: "L1" },
    ];
    expect(eliminateUnreachableCode(instrs)).toEqual(instrs);
  });

  it("removes the else-branch when the condition is a known-true constant", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(true) },
      { kind: "IfFalse", condition: T(1), label: "L1" },
      { kind: "Log", message: "then" },
      { kind: "Goto", label: "L2" },
      { kind: "Label", label: "L1" },
      { kind: "Log", message: "else" },
      { kind: "Label", label: "L2" },
    ];
    expect(fmt(eliminateUnreachableCode(instrs))).toEqual(["t1 = true", "IF_FALSE t1 GOTO L1", 'LOG "then"', "GOTO L2", "LABEL L2"]);
  });

  it("removes the then-branch when the condition is a known-false constant", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(false) },
      { kind: "IfFalse", condition: T(1), label: "L1" },
      { kind: "Log", message: "then" },
      { kind: "Goto", label: "L2" },
      { kind: "Label", label: "L1" },
      { kind: "Log", message: "else" },
      { kind: "Label", label: "L2" },
    ];
    expect(fmt(eliminateUnreachableCode(instrs))).toEqual(["t1 = false", "IF_FALSE t1 GOTO L1", "LABEL L1", 'LOG "else"', "LABEL L2"]);
  });

  it("removes code that follows an unconditional Goto with no other incoming path", () => {
    const instrs: IRInstruction[] = [
      { kind: "Goto", label: "L1" },
      { kind: "Log", message: "dead" },
      { kind: "Label", label: "L1" },
      { kind: "Log", message: "alive" },
    ];
    expect(fmt(eliminateUnreachableCode(instrs))).toEqual(["GOTO L1", "LABEL L1", 'LOG "alive"']);
  });

  it("keeps a label reachable by ordinary fallthrough even if its only jump edge is excluded", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(true) },
      { kind: "IfFalse", condition: T(1), label: "L1" },
      { kind: "Log", message: "a" },
      { kind: "Label", label: "L1" },
    ];
    expect(eliminateUnreachableCode(instrs)).toEqual(instrs);
  });
});

describe("eliminateDeadCode", () => {
  it("removes a temp definition that is never used", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(1) },
      { kind: "Assign", dest: T(2), value: C(2) },
      { kind: "Call", name: "notify", args: [T(1)] },
    ];
    expect(fmt(eliminateDeadCode(instrs))).toEqual(["t1 = 1", "CALL notify(t1)"]);
  });

  it("transitively removes a chain of definitions that become dead together", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(1) },
      { kind: "Assign", dest: T(2), value: C(2) },
      { kind: "Binary", operator: "+", dest: T(3), left: T(1), right: T(2) },
      { kind: "Assign", dest: T(4), value: C(99) },
      { kind: "Call", name: "notify", args: [T(4)] },
    ];
    // t1, t2, t3 are only ever used to compute t3, which nothing consumes.
    expect(fmt(eliminateDeadCode(instrs))).toEqual(["t4 = 99", "CALL notify(t4)"]);
  });

  it("keeps a definition used only by an IfFalse condition", () => {
    const instrs: IRInstruction[] = [
      { kind: "Assign", dest: T(1), value: C(true) },
      { kind: "IfFalse", condition: T(1), label: "L1" },
      { kind: "Label", label: "L1" },
    ];
    expect(eliminateDeadCode(instrs)).toEqual(instrs);
  });

  it("never removes side-effecting instructions (Call/Alert/Log)", () => {
    const instrs: IRInstruction[] = [
      { kind: "Alert", message: "hi" },
      { kind: "Log", message: "hi" },
      { kind: "Call", name: "f", args: [] },
    ];
    expect(eliminateDeadCode(instrs)).toEqual(instrs);
  });
});

describe("optimizeWorkflow (end-to-end)", () => {
  it("folds a constant-true when/otherwise down to the always-taken branch", () => {
    const ir = irFor(`workflow "T" { when 10 > 5 { alert "always" } otherwise { log "never" } }`);
    expect(fmt(optimizeWorkflow(ir).instructions)).toEqual(["t3 = true", "IF_FALSE t3 GOTO L1", 'ALERT "always"', "GOTO L2", "LABEL L2"]);
  });

  it("folds a constant-false when/otherwise down to the always-taken branch", () => {
    const ir = irFor(`workflow "T" { when 1 == 2 { alert "never" } otherwise { log "always" } }`);
    expect(fmt(optimizeWorkflow(ir).instructions)).toEqual(["t3 = false", "IF_FALSE t3 GOTO L1", "LABEL L1", 'LOG "always"', "LABEL L2"]);
  });

  it("removes dead temporaries left behind after folding a sub-expression", () => {
    const ir = irFor(`workflow "T" { input x : number action notify(x + (1 + 2)) }`);
    expect(fmt(optimizeWorkflow(ir).instructions)).toEqual(["t1 = x", "t4 = 3", "t5 = t1 + t4", "CALL notify(t5)"]);
  });

  it("leaves a runtime-dependent condition's branches intact", () => {
    const ir = irFor(`workflow "T" { sensor temperature : number when temperature > 35 { log "hot" } }`);
    expect(optimizeWorkflow(ir).instructions).toEqual(ir.instructions);
  });

  it("preserves the canonical cooling-system program's observable structure unchanged (no constant conditions)", () => {
    const ir = irFor(`
      workflow "CoolingSystem" {
          sensor temperature : number
          when temperature > 35 {
              alert "High temperature"
              action start_fan()
          }
          otherwise {
              log "Temperature normal"
          }
      }
    `);
    expect(optimizeWorkflow(ir).instructions).toEqual(ir.instructions);
  });
});
