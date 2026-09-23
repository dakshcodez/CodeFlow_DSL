import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../../src/compiler/pipeline.js";

function loadExample(relativePath: string): string {
  return readFileSync(new URL(`../../examples/${relativePath}`, import.meta.url), "utf-8");
}

describe("compile pipeline", () => {
  it("compiles the canonical cooling-system example with no errors", () => {
    const { program, errors } = compile(loadExample("cooling.cflow"));
    expect(errors).toEqual([]);
    expect(program.workflows).toHaveLength(1);
    expect(program.workflows[0]!.name).toBe("CoolingSystem");
  });

  it("compiles the canonical order-processing example with no errors", () => {
    const { program, errors } = compile(loadExample("order-processing.cflow"));
    expect(errors).toEqual([]);
    expect(program.workflows).toHaveLength(1);
    expect(program.workflows[0]!.name).toBe("OrderProcessing");
  });

  it("reports a syntax error for the missing-brace example", () => {
    const { errors } = compile(loadExample("errors/missing-brace.cflow"));
    expect(errors.some((e) => e.stage === "syntax")).toBe(true);
  });

  it("reports a lexical error for the invalid-token example", () => {
    const { errors } = compile(loadExample("errors/invalid-token.cflow"));
    expect(errors.some((e) => e.stage === "lexical")).toBe(true);
  });

  it("parses the undefined-identifier example without error at Phase 1 (no semantic analysis yet)", () => {
    const { errors } = compile(loadExample("errors/undefined-identifier.cflow"));
    expect(errors).toEqual([]);
  });

  it("parses the invalid-type example without error at Phase 1 (no semantic analysis yet)", () => {
    const { errors } = compile(loadExample("errors/invalid-type.cflow"));
    expect(errors).toEqual([]);
  });
});
