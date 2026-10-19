import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, run } from "../../src/compiler/pipeline.js";
import { execute } from "../../src/runtime/interpreter.js";

function loadExample(relativePath: string): string {
  return readFileSync(new URL(`../../examples/${relativePath}`, import.meta.url), "utf-8");
}

/**
 * End-to-end regression tests exercising the complete pipeline through
 * `run()` (source → tokens → AST → semantic analysis/symbol table → TAC
 * → optimized TAC → execution), matching the "Definition of Done"
 * checklist in CLAUDE.md §31. Per-stage behavior is covered in more
 * detail by the unit tests alongside each module; these tests verify the
 * stages compose correctly as one pipeline for representative and
 * malformed programs alike.
 */
describe("end-to-end pipeline (run)", () => {
  it("satisfies every Definition-of-Done checkpoint for the canonical cooling-system program", () => {
    const result = run(loadExample("cooling.cflow"), { temperature: 38 });

    // Lexed
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.tokens.at(-1)).toMatchObject({ kind: "EOF" });

    // Parsed / AST constructed
    expect(result.program.kind).toBe("Program");
    expect(result.program.workflows).toHaveLength(1);
    expect(result.program.workflows[0]!.name).toBe("CoolingSystem");

    // Semantically validated / Symbol table populated
    expect(result.errors.filter((e) => e.stage === "semantic")).toEqual([]);
    expect(result.symbolTables).toHaveLength(1);
    expect(result.symbolTables[0]!.symbols).toEqual([
      expect.objectContaining({ name: "temperature", kind: "sensor", type: "number" }),
    ]);

    // TAC generated / TAC optimized
    expect(result.ir[0]!.instructions.length).toBeGreaterThan(0);
    expect(Array.isArray(result.optimizedIR)).toBe(true);

    // Optimized TAC executed / result produced
    expect(result.execution).toHaveLength(1);
    expect(result.execution[0]!.workflowName).toBe("CoolingSystem");
    expect(result.execution[0]!.trace).toEqual([
      { kind: "Alert", message: "High temperature" },
      { kind: "Action", name: "start_fan", args: [] },
    ]);
    expect(result.execution[0]!.errors).toEqual([]);

    // Errors reported consistently (no lexical/syntax/semantic errors here)
    expect(result.errors).toEqual([]);
  });

  it("takes the otherwise branch end-to-end when the condition is false", () => {
    const result = run(loadExample("cooling.cflow"), { temperature: 20 });
    expect(result.execution[0]!.trace).toEqual([{ kind: "Log", message: "Temperature normal" }]);
  });

  it("runs the order-processing example end-to-end across multiple threshold inputs", () => {
    const source = loadExample("order-processing.cflow");
    expect(run(source, { orderAmount: 12000 }).execution[0]!.trace.map((e) => (e as { name: string }).name)).toEqual([
      "fraud_check",
      "manager_approval",
      "process_payment",
    ]);
    expect(run(source, { orderAmount: 100 }).execution[0]!.trace.map((e) => (e as { name: string }).name)).toEqual([
      "process_payment",
    ]);
  });

  it("produces identical execution traces from the unoptimized and optimized IR of the same run", () => {
    const source = loadExample("order-processing.cflow");
    const compiled = compile(source);
    const inputs = { orderAmount: 7000 };
    const fromUnoptimized = execute(compiled.ir, inputs, compiled.symbolTables);
    const fromOptimized = execute(compiled.optimizedIR, inputs, compiled.symbolTables);
    expect(fromOptimized).toEqual(fromUnoptimized);
  });

  it("reports a runtime error end-to-end when a required sensor value is not supplied", () => {
    const result = run(loadExample("cooling.cflow"), {});
    expect(result.execution[0]!.errors).toEqual([
      expect.objectContaining({ stage: "runtime", message: "No runtime value provided for 'temperature'" }),
    ]);
  });

  describe("malformed programs never crash the pipeline", () => {
    const malformedFiles = [
      "errors/missing-brace.cflow",
      "errors/invalid-token.cflow",
      "errors/undefined-identifier.cflow",
      "errors/invalid-type.cflow",
    ];

    it.each(malformedFiles)("run() completes and reports at least one error for %s", (relativePath) => {
      const result = run(loadExample(relativePath), {});
      expect(result.errors.length).toBeGreaterThan(0);
      for (const error of result.errors) {
        expect(["lexical", "syntax", "semantic", "runtime"]).toContain(error.stage);
        expect(typeof error.message).toBe("string");
      }
      // Whatever workflows the parser recovered still produce a
      // well-formed (possibly empty) execution result, never a throw.
      expect(result.execution).toHaveLength(result.program.workflows.length);
    });
  });
});
