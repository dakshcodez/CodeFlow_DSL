import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../../src/compiler/pipeline.js";
import { formatInstruction, formatWorkflowIR } from "../../src/ir/print.js";

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

  it("reports a semantic error for the undefined-identifier example", () => {
    const { errors } = compile(loadExample("errors/undefined-identifier.cflow"));
    expect(errors.some((e) => e.stage === "semantic" && e.message.includes("Undefined identifier"))).toBe(
      true
    );
  });

  it("reports a semantic error for the invalid-type example", () => {
    const { errors } = compile(loadExample("errors/invalid-type.cflow"));
    expect(errors.some((e) => e.stage === "semantic")).toBe(true);
  });

  it("populates a symbol table per workflow", () => {
    const { symbolTables } = compile(loadExample("cooling.cflow"));
    expect(symbolTables).toHaveLength(1);
    expect(symbolTables[0]!.symbols).toEqual([
      expect.objectContaining({ name: "temperature", kind: "sensor", type: "number" }),
    ]);
  });

  it("generates TAC for the canonical cooling-system example", () => {
    const { ir } = compile(loadExample("cooling.cflow"));
    expect(ir).toHaveLength(1);
    expect(ir[0]!.workflowName).toBe("CoolingSystem");
    expect(ir[0]!.instructions.map(formatInstruction)).toEqual([
      "t1 = temperature",
      "t2 = 35",
      "t3 = t1 > t2",
      "IF_FALSE t3 GOTO L1",
      'ALERT "High temperature"',
      "CALL start_fan()",
      "GOTO L2",
      "LABEL L1",
      'LOG "Temperature normal"',
      "LABEL L2",
    ]);
  });

  it("leaves optimizedIR identical to ir when nothing is statically foldable", () => {
    const { ir, optimizedIR } = compile(loadExample("cooling.cflow"));
    expect(optimizedIR).toEqual(ir);
  });

  it("shrinks optimizedIR relative to ir for a program with a statically-known condition", () => {
    const { ir, optimizedIR } = compile(`workflow "T" { when 10 > 5 { alert "always" } otherwise { log "never" } }`);
    expect(formatWorkflowIR(ir[0]!)).toBe(
      [
        'workflow "T":',
        "    t1 = 10",
        "    t2 = 5",
        "    t3 = t1 > t2",
        "    IF_FALSE t3 GOTO L1",
        '    ALERT "always"',
        "    GOTO L2",
        "LABEL L1",
        '    LOG "never"',
        "LABEL L2",
      ].join("\n")
    );
    expect(formatWorkflowIR(optimizedIR[0]!)).toBe(
      ["workflow \"T\":", "    t3 = true", "    IF_FALSE t3 GOTO L1", '    ALERT "always"', "    GOTO L2", "LABEL L2"].join(
        "\n"
      )
    );
  });
});
