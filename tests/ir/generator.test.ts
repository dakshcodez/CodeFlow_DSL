import { describe, expect, it } from "vitest";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { generateIR } from "../../src/ir/generator.js";
import { formatInstruction, formatWorkflowIR } from "../../src/ir/print.js";
import type { IRInstruction } from "../../src/ir/instructions.js";

function generate(source: string): IRInstruction[] {
  const { tokens } = new Lexer(source).tokenize();
  const { program, errors } = new Parser(tokens).parse();
  expect(errors).toEqual([]);
  const ir = generateIR(program);
  expect(ir).toHaveLength(1);
  return ir[0]!.instructions;
}

function lines(source: string): string[] {
  return generate(source).map(formatInstruction);
}

describe("IR generator", () => {
  it("lowers arithmetic expressions into named temporaries", () => {
    expect(lines(`workflow "T" { action notify(1 + 2 * 3) }`)).toEqual([
      "t1 = 1",
      "t2 = 2",
      "t3 = 3",
      "t4 = t2 * t3",
      "t5 = t1 + t4",
      "CALL notify(t5)",
    ]);
  });

  it("lowers a comparison into a Binary instruction over materialized operands", () => {
    expect(lines(`workflow "T" { sensor temperature : number when temperature > 35 { log "hot" } }`)).toEqual([
      "t1 = temperature",
      "t2 = 35",
      "t3 = t1 > t2",
      "IF_FALSE t3 GOTO L1",
      'LOG "hot"',
      "LABEL L1",
    ]);
  });

  it("emits a matching conditional jump and label for a when without otherwise", () => {
    const instrs = generate(`workflow "T" { when true { log "x" } }`);
    // instrs[0] materializes the `true` literal into a temp before the jump.
    expect(instrs[1]).toMatchObject({ kind: "IfFalse", label: "L1" });
    expect(instrs.at(-1)).toMatchObject({ kind: "Label", label: "L1" });
  });

  it("lowers a when/otherwise pair into an if/else with a shared end label", () => {
    expect(lines(`workflow "T" { when true { log "a" } otherwise { log "b" } }`)).toEqual([
      "t1 = true",
      "IF_FALSE t1 GOTO L1",
      'LOG "a"',
      "GOTO L2",
      "LABEL L1",
      'LOG "b"',
      "LABEL L2",
    ]);
  });

  it("does not fall through into the otherwise branch when the when branch executes", () => {
    // Regression: a naive lowering without the GOTO L2 would execute both
    // branches when the condition is true.
    const instrs = generate(`workflow "T" { when true { log "a" } otherwise { log "b" } }`);
    const gotoIndex = instrs.findIndex((i) => i.kind === "Goto");
    const elseLabelIndex = instrs.findIndex((i) => i.kind === "Label");
    expect(gotoIndex).toBeGreaterThanOrEqual(0);
    expect(gotoIndex).toBeLessThan(elseLabelIndex);
  });

  it("treats an otherwise with no preceding when as unconditional", () => {
    expect(lines(`workflow "T" { otherwise { log "always" } }`)).toEqual(['LOG "always"']);
  });

  it("generates independent temp/label numbering for multiple when statements", () => {
    const instrs = generate(`
      workflow "T" {
          input amount : number
          when amount > 5000 { action a() }
          when amount > 10000 { action b() }
      }
    `);
    const labels = instrs.filter((i) => i.kind === "Label").map((i) => (i as { label: string }).label);
    expect(labels).toEqual(["L1", "L2"]);
    const temps = instrs.filter((i) => i.kind === "Assign").map((i) => (i as { dest: { id: number } }).dest.id);
    expect(temps).toEqual([1, 2, 4, 5]);
  });

  it("lowers action calls with multiple materialized arguments", () => {
    expect(lines(`workflow "T" { action notify(1, "x", true) }`)).toEqual([
      "t1 = 1",
      "t2 = \"x\"",
      "t3 = true",
      'CALL notify(t1, t2, t3)',
    ]);
  });

  it("lowers action calls with no arguments", () => {
    expect(lines(`workflow "T" { action start_fan() }`)).toEqual(["CALL start_fan()"]);
  });

  it("lowers alert and log statements directly, without temporaries", () => {
    expect(lines(`workflow "T" { alert "Hot" log "Normal" }`)).toEqual(['ALERT "Hot"', 'LOG "Normal"']);
  });

  it("lowers a unary NOT and unary minus", () => {
    expect(lines(`workflow "T" { input b : boolean action notify(NOT b) }`)).toEqual([
      "t1 = b",
      "t2 = NOT t1",
      "CALL notify(t2)",
    ]);
    expect(lines(`workflow "T" { input n : number action notify(-n) }`)).toEqual([
      "t1 = n",
      "t2 = - t1",
      "CALL notify(t2)",
    ]);
  });

  it("lowers nested when/otherwise blocks", () => {
    const instrs = generate(`
      workflow "T" {
          input x : number
          when x > 0 {
              when x > 10 { log "big" }
              otherwise { log "small" }
          }
      }
    `);
    const kinds = instrs.map((i) => i.kind);
    expect(kinds).toEqual([
      "Assign",
      "Assign",
      "Binary",
      "IfFalse",
      "Assign",
      "Assign",
      "Binary",
      "IfFalse",
      "Log",
      "Goto",
      "Label",
      "Log",
      "Label",
      "Label",
    ]);
  });

  it("generates one instruction sequence per workflow, independently numbered", () => {
    const { tokens } = new Lexer(`
      workflow "A" { sensor x : number when x > 1 { log "a" } }
      workflow "B" { sensor y : number when y > 1 { log "b" } }
    `).tokenize();
    const { program, errors } = new Parser(tokens).parse();
    expect(errors).toEqual([]);
    const ir = generateIR(program);
    expect(ir.map((w) => w.workflowName)).toEqual(["A", "B"]);
    expect(ir[0]!.instructions[0]).toMatchObject({ kind: "Assign", dest: { id: 1 } });
    expect(ir[1]!.instructions[0]).toMatchObject({ kind: "Assign", dest: { id: 1 } });
  });

  it("formats a full workflow as readable text", () => {
    const { tokens } = new Lexer(`workflow "T" { when true { log "x" } }`).tokenize();
    const { program } = new Parser(tokens).parse();
    const text = formatWorkflowIR(generateIR(program)[0]!);
    expect(text).toBe(['workflow "T":', "    t1 = true", "    IF_FALSE t1 GOTO L1", '    LOG "x"', "LABEL L1"].join(
      "\n"
    ));
  });
});
