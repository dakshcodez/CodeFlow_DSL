import { describe, expect, it } from "vitest";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { analyze } from "../../src/semantic/analyzer.js";
import type { CompilerError } from "../../src/diagnostics/diagnostics.js";

function check(source: string): { errors: CompilerError[]; result: ReturnType<typeof analyze> } {
  const { tokens } = new Lexer(source).tokenize();
  const { program, errors: parseErrors } = new Parser(tokens).parse();
  expect(parseErrors).toEqual([]);
  const result = analyze(program);
  return { errors: result.errors, result };
}

function wrap(body: string): string {
  return `workflow "T" { ${body} }`;
}

describe("SemanticAnalyzer", () => {
  describe("declarations", () => {
    it("accepts valid sensor and input declarations with no errors", () => {
      const { errors, result } = check(`
        workflow "CoolingSystem" {
            sensor temperature : number
            input threshold : number
            when temperature > threshold {
                log "ok"
            }
        }
      `);
      expect(errors).toEqual([]);
      expect(result.symbolTables).toHaveLength(1);
      expect(result.symbolTables[0]!.symbols.map((s) => s.name)).toEqual(["temperature", "threshold"]);
    });

    it("reports a duplicate declaration in the same workflow", () => {
      const { errors } = check(`
        workflow "T" {
            sensor temperature : number
            input temperature : string
        }
      `);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ stage: "semantic" });
      expect(errors[0]!.message).toMatch(/Duplicate declaration of 'temperature'/);
    });
  });

  describe("undefined identifiers", () => {
    it("reports an undefined identifier referenced in a condition", () => {
      const { errors } = check(wrap(`when temperature > 30 { log "hot" }`));
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe("Undefined identifier 'temperature'");
    });

    it("reports an undefined identifier used as an action argument", () => {
      const { errors } = check(wrap(`action notify(missing)`));
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe("Undefined identifier 'missing'");
    });

    it("does not report undeclared action names (actions are not declarations)", () => {
      const { errors } = check(wrap(`action start_fan()`));
      expect(errors).toEqual([]);
    });
  });

  describe("workflow scope", () => {
    it("does not leak a declaration from one workflow into another", () => {
      const { errors } = check(`
        workflow "A" { sensor x : number }
        workflow "B" { when x > 1 { log "y" } }
      `);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe("Undefined identifier 'x'");
    });

    it("resolves a declaration inside nested when/otherwise blocks of the same workflow", () => {
      const { errors } = check(`
        workflow "T" {
            input x : number
            when x > 0 {
                when x > 10 { log "big" }
                otherwise { log "small" }
            }
        }
      `);
      expect(errors).toEqual([]);
    });
  });

  describe("valid typed operations", () => {
    const declarations = `
        input n : number
        input b : boolean
        input s : string
    `;

    it("accepts number > number", () => {
      const { errors } = check(`workflow "T" { ${declarations} when n > 1 { log "ok" } }`);
      expect(errors).toEqual([]);
    });

    it("accepts number + number", () => {
      const { errors } = check(`workflow "T" { ${declarations} action notify(n + 1) }`);
      expect(errors).toEqual([]);
    });

    it("accepts boolean AND boolean", () => {
      const { errors } = check(`workflow "T" { ${declarations} when b AND true { log "ok" } }`);
      expect(errors).toEqual([]);
    });

    it("accepts string == string", () => {
      const { errors } = check(`workflow "T" { ${declarations} when s == "x" { log "ok" } }`);
      expect(errors).toEqual([]);
    });

    it("accepts boolean == boolean", () => {
      const { errors } = check(`workflow "T" { ${declarations} when b == true { log "ok" } }`);
      expect(errors).toEqual([]);
    });
  });

  describe("invalid typed operations", () => {
    it('rejects "hello" > 10 (string compared relationally with number)', () => {
      const { errors } = check(wrap(`when "hello" > 10 { log "x" }`));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("expects operands of type 'number, number'"))).toBe(true);
    });

    it("rejects true + 5 (boolean used in arithmetic)", () => {
      const { errors } = check(wrap(`action notify(true + 5)`));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("expects operands of type 'number, number'"))).toBe(true);
    });

    it("rejects 10 AND 5 (numbers used with logical AND)", () => {
      const { errors } = check(wrap(`when 10 AND 5 { log "x" }`));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("expects operands of type 'boolean, boolean'"))).toBe(true);
    });

    it("rejects temperature AND 10 where temperature is a number", () => {
      const { errors } = check(`
        workflow "T" {
            sensor temperature : number
            when temperature AND 10 { log "x" }
        }
      `);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("expects operands of type 'boolean, boolean'"))).toBe(true);
    });
  });

  describe("equality compatibility", () => {
    it("accepts equality between two operands of the same type", () => {
      const { errors } = check(wrap(`when 1 == 1 { log "x" }`));
      expect(errors).toEqual([]);
    });

    it("rejects equality between operands of different types", () => {
      const { errors } = check(wrap(`when 1 == "1" { log "x" }`));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("two operands of the same type"))).toBe(true);
    });
  });

  describe("when condition type", () => {
    it("rejects a non-boolean when condition", () => {
      const { errors } = check(wrap(`when 5 { log "x" }`));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("must be of type 'boolean'"))).toBe(true);
    });

    it("does not cascade a second error when the condition already failed to resolve", () => {
      const { errors } = check(wrap(`when undeclared { log "x" }`));
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe("Undefined identifier 'undeclared'");
    });
  });

  describe("unary operators", () => {
    it("accepts unary minus on a number and NOT on a boolean", () => {
      const { errors } = check(`
        workflow "T" {
            input n : number
            input b : boolean
            when NOT b { log "x" }
            action notify(-n)
        }
      `);
      expect(errors).toEqual([]);
    });

    it("rejects unary minus on a non-number", () => {
      const { errors } = check(wrap(`action notify(-true)`));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.message).toMatch(/Unary '-' requires an operand of type 'number'/);
    });
  });
});
