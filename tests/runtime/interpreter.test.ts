import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { analyze } from "../../src/semantic/analyzer.js";
import { generateIR } from "../../src/ir/generator.js";
import { optimize } from "../../src/optimizer/optimizer.js";
import { execute, executeWorkflow, formatEffect } from "../../src/runtime/interpreter.js";
import type { RuntimeInputs, WorkflowExecutionResult } from "../../src/runtime/interpreter.js";

function loadExample(relativePath: string): string {
  return readFileSync(new URL(`../../examples/${relativePath}`, import.meta.url), "utf-8");
}

/** Compiles source through semantic analysis, IR generation, and optimization, then runs it. */
function run(source: string, inputs: RuntimeInputs = {}): WorkflowExecutionResult[] {
  const { tokens } = new Lexer(source).tokenize();
  const { program, errors } = new Parser(tokens).parse();
  expect(errors).toEqual([]);
  const { symbolTables, errors: semanticErrors } = analyze(program);
  expect(semanticErrors).toEqual([]);
  const ir = optimize(generateIR(program));
  return execute(ir, inputs, symbolTables);
}

function runOne(source: string, inputs: RuntimeInputs = {}): WorkflowExecutionResult {
  const results = run(source, inputs);
  expect(results).toHaveLength(1);
  return results[0]!;
}

describe("interpreter", () => {
  it("takes the true branch of a when/otherwise", () => {
    const result = runOne(loadExample("cooling.cflow"), { temperature: 38 });
    expect(result.errors).toEqual([]);
    expect(result.trace).toEqual([
      { kind: "Alert", message: "High temperature" },
      { kind: "Action", name: "start_fan", args: [] },
    ]);
  });

  it("takes the false (otherwise) branch of a when/otherwise", () => {
    const result = runOne(loadExample("cooling.cflow"), { temperature: 20 });
    expect(result.errors).toEqual([]);
    expect(result.trace).toEqual([{ kind: "Log", message: "Temperature normal" }]);
  });

  it("evaluates multiple independent when conditions in sequence", () => {
    const highAmount = runOne(loadExample("order-processing.cflow"), { orderAmount: 12000 });
    expect(highAmount.trace).toEqual([
      { kind: "Action", name: "fraud_check", args: [] },
      { kind: "Action", name: "manager_approval", args: [] },
      { kind: "Action", name: "process_payment", args: [] },
    ]);

    const lowAmount = runOne(loadExample("order-processing.cflow"), { orderAmount: 100 });
    expect(lowAmount.trace).toEqual([{ kind: "Action", name: "process_payment", args: [] }]);

    const midAmount = runOne(loadExample("order-processing.cflow"), { orderAmount: 6000 });
    expect(midAmount.trace).toEqual([
      { kind: "Action", name: "fraud_check", args: [] },
      { kind: "Action", name: "process_payment", args: [] },
    ]);
  });

  it("dispatches an action with evaluated argument values", () => {
    const result = runOne(`workflow "T" { input n : number action notify(n + 1, "x", true) }`, { n: 4 });
    expect(result.trace).toEqual([{ kind: "Action", name: "notify", args: [5, "x", true] }]);
  });

  it("emits alerts and logs with their literal message text", () => {
    const result = runOne(`workflow "T" { alert "a message" log "a log" }`);
    expect(result.trace).toEqual([
      { kind: "Alert", message: "a message" },
      { kind: "Log", message: "a log" },
    ]);
  });

  it("reports a runtime error and halts on a missing input value", () => {
    const result = runOne(loadExample("cooling.cflow"), {});
    expect(result.trace).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({ stage: "runtime", message: "No runtime value provided for 'temperature'" }),
    ]);
  });

  it("reports a runtime error on division by zero", () => {
    const result = runOne(`workflow "T" { sensor x : number action notify(10 / x) }`, { x: 0 });
    expect(result.trace).toEqual([]);
    expect(result.errors).toEqual([expect.objectContaining({ stage: "runtime", message: "Division by zero" })]);
  });

  it("reports a runtime error when a supplied input's type does not match its declaration", () => {
    const result = runOne(`workflow "T" { sensor x : boolean when x { log "on" } otherwise { log "off" } }`, {
      x: "not-a-boolean",
    });
    expect(result.errors).toEqual([
      expect.objectContaining({
        stage: "runtime",
        message: "Type mismatch for 'x': expected boolean but received string (\"not-a-boolean\")",
      }),
    ]);
  });

  it("halts the trace at the point a runtime error occurs, but keeps effects emitted before it", () => {
    const result = runOne(
      `workflow "T" { sensor x : number alert "before" action notify(10 / x) log "after" }`,
      { x: 0 }
    );
    expect(result.trace).toEqual([{ kind: "Alert", message: "before" }]);
    expect(result.errors).toHaveLength(1);
  });

  it("accepts input values across the CodeFlow primitive types", () => {
    const result = runOne(
      `workflow "T" {
          input n : number
          input s : string
          input b : boolean
          when n > 0 AND s == "go" AND b { action fire() }
      }`,
      { n: 5, s: "go", b: true }
    );
    expect(result.trace).toEqual([{ kind: "Action", name: "fire", args: [] }]);
  });

  it("executes each workflow of a multi-workflow program independently", () => {
    const { tokens } = new Lexer(`
      workflow "A" { sensor x : number when x > 0 { log "a-positive" } }
      workflow "B" { sensor y : number when y > 0 { log "b-positive" } }
    `).tokenize();
    const { program } = new Parser(tokens).parse();
    const { symbolTables } = analyze(program);
    const ir = optimize(generateIR(program));
    const results = execute(ir, { x: 1, y: -1 }, symbolTables);
    expect(results.map((r) => [r.workflowName, r.trace])).toEqual([
      ["A", [{ kind: "Log", message: "a-positive" }]],
      ["B", []],
    ]);
  });

  it("produces identical results for unoptimized and optimized IR of the same program", () => {
    const { tokens } = new Lexer(loadExample("order-processing.cflow")).tokenize();
    const { program } = new Parser(tokens).parse();
    const { symbolTables } = analyze(program);
    const unoptimized = generateIR(program);
    const optimized = optimize(unoptimized);
    const inputs = { orderAmount: 7000 };
    expect(execute(optimized, inputs, symbolTables)).toEqual(execute(unoptimized, inputs, symbolTables));
  });

  it("formats each effect kind for display", () => {
    expect(formatEffect({ kind: "Alert", message: "hi" })).toBe("ALERT: hi");
    expect(formatEffect({ kind: "Log", message: "hi" })).toBe("LOG: hi");
    expect(formatEffect({ kind: "Action", name: "f", args: [1, "x", true] })).toBe('ACTION: f(1, "x", true)');
  });

  it("executeWorkflow runs a single workflow's optimized IR directly", () => {
    const { tokens } = new Lexer(loadExample("cooling.cflow")).tokenize();
    const { program } = new Parser(tokens).parse();
    const { symbolTables } = analyze(program);
    const ir = optimize(generateIR(program))[0]!;
    const result = executeWorkflow(ir, { temperature: 40 }, symbolTables[0]!);
    expect(result.trace).toEqual([
      { kind: "Alert", message: "High temperature" },
      { kind: "Action", name: "start_fan", args: [] },
    ]);
  });
});
