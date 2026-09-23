import { describe, expect, it } from "vitest";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import type { Expr, Program } from "../../src/ast/nodes.js";

function parse(source: string) {
  const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
  const { program, errors: parseErrors } = new Parser(tokens).parse();
  return { program, errors: [...lexErrors, ...parseErrors] };
}

function parseExpr(source: string): Expr {
  const workflow = `workflow "T" { when ${source} { log "x" } }`;
  const { program, errors } = parse(workflow);
  expect(errors).toEqual([]);
  const when = program.workflows[0]!.statements[0];
  if (when?.kind !== "WhenStatement") throw new Error("expected when statement");
  return when.condition;
}

describe("Parser", () => {
  it("parses the canonical sensor-driven workflow", () => {
    const source = `
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
    `;
    const { program, errors } = parse(source);
    expect(errors).toEqual([]);
    expect(program.workflows).toHaveLength(1);

    const workflow = program.workflows[0]!;
    expect(workflow.name).toBe("CoolingSystem");
    expect(workflow.declarations).toEqual([
      { kind: "Declaration", declKind: "sensor", name: "temperature", type: "number", loc: expect.any(Object) },
    ]);
    expect(workflow.statements).toHaveLength(2);

    const whenStmt = workflow.statements[0];
    if (whenStmt?.kind !== "WhenStatement") throw new Error("expected when statement");
    expect(whenStmt.condition).toMatchObject({
      kind: "BinaryExpr",
      operator: ">",
      left: { kind: "IdentifierExpr", name: "temperature" },
      right: { kind: "LiteralExpr", literalType: "number", value: 35 },
    });
    expect(whenStmt.body).toEqual([
      { kind: "AlertStatement", message: "High temperature", loc: expect.any(Object) },
      { kind: "ActionStatement", name: "start_fan", args: [], loc: expect.any(Object) },
    ]);

    const otherwiseStmt = workflow.statements[1];
    if (otherwiseStmt?.kind !== "OtherwiseStatement") throw new Error("expected otherwise statement");
    expect(otherwiseStmt.body).toEqual([
      { kind: "LogStatement", message: "Temperature normal", loc: expect.any(Object) },
    ]);
  });

  it("parses the canonical input-driven workflow with multiple whens and a top-level action", () => {
    const source = `
      workflow "OrderProcessing" {
          input orderAmount : number

          when orderAmount > 5000 {
              action fraud_check()
          }

          when orderAmount > 10000 {
              action manager_approval()
          }

          action process_payment()
      }
    `;
    const { program, errors } = parse(source);
    expect(errors).toEqual([]);
    const workflow = program.workflows[0]!;
    expect(workflow.declarations).toHaveLength(1);
    expect(workflow.declarations[0]).toMatchObject({ declKind: "input", name: "orderAmount", type: "number" });
    expect(workflow.statements).toHaveLength(3);
    expect(workflow.statements[2]).toMatchObject({ kind: "ActionStatement", name: "process_payment" });
  });

  it("parses multiple top-level workflows", () => {
    const { program, errors } = parse(`
      workflow "A" { action a() }
      workflow "B" { action b() }
    `);
    expect(errors).toEqual([]);
    expect(program.workflows.map((w: Program["workflows"][number]) => w.name)).toEqual(["A", "B"]);
  });

  it("parses nested when/otherwise blocks", () => {
    const source = `
      workflow "Nested" {
          input x : number
          when x > 0 {
              when x > 10 {
                  log "big"
              }
              otherwise {
                  log "small"
              }
          }
      }
    `;
    const { errors, program } = parse(source);
    expect(errors).toEqual([]);
    const outer = program.workflows[0]!.statements[0];
    if (outer?.kind !== "WhenStatement") throw new Error("expected when statement");
    expect(outer.body).toHaveLength(2);
    expect(outer.body[0]!.kind).toBe("WhenStatement");
    expect(outer.body[1]!.kind).toBe("OtherwiseStatement");
  });

  it("parses action statements with multiple arguments", () => {
    const { program, errors } = parse(`workflow "T" { action notify(1, "x", true, 2 + 3) }`);
    expect(errors).toEqual([]);
    const action = program.workflows[0]!.statements[0];
    if (action?.kind !== "ActionStatement") throw new Error("expected action statement");
    expect(action.args).toHaveLength(4);
  });

  describe("operator precedence", () => {
    it("binds * before +", () => {
      expect(parseExpr("1 + 2 * 3")).toMatchObject({
        operator: "+",
        left: { kind: "LiteralExpr", value: 1 },
        right: { operator: "*", left: { value: 2 }, right: { value: 3 } },
      });
    });

    it("binds relational operators before AND", () => {
      expect(parseExpr("a > 1 AND b < 2")).toMatchObject({
        operator: "AND",
        left: { operator: ">" },
        right: { operator: "<" },
      });
    });

    it("binds AND before OR", () => {
      expect(parseExpr("a AND b OR c")).toMatchObject({
        operator: "OR",
        left: { operator: "AND" },
        right: { kind: "IdentifierExpr", name: "c" },
      });
    });

    it("binds NOT tighter than AND/OR", () => {
      expect(parseExpr("NOT a AND b")).toMatchObject({
        operator: "AND",
        left: { kind: "UnaryExpr", operator: "NOT" },
        right: { kind: "IdentifierExpr", name: "b" },
      });
    });

    it("respects explicit parentheses", () => {
      expect(parseExpr("(1 + 2) * 3")).toMatchObject({
        operator: "*",
        left: { operator: "+" },
        right: { value: 3 },
      });
    });

    it("parses unary minus tighter than binary operators", () => {
      expect(parseExpr("-1 + 2")).toMatchObject({
        operator: "+",
        left: { kind: "UnaryExpr", operator: "-" },
        right: { value: 2 },
      });
    });

    it("left-associates additive operators", () => {
      expect(parseExpr("1 - 2 - 3")).toMatchObject({
        operator: "-",
        left: { operator: "-", left: { value: 1 }, right: { value: 2 } },
        right: { value: 3 },
      });
    });
  });

  describe("malformed input", () => {
    it("reports a missing closing brace", () => {
      const source = `
        workflow "Test" {
            input temperature : number

            when temperature > 30 {
                alert "Hot"
      `;
      const { errors } = parse(source);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatchObject({ stage: "syntax" });
    });

    it("reports an unexpected token at the top level", () => {
      const source = `
        workflow "Test" {
            input temperature : number
            @
        }
      `;
      const { errors } = parse(source);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.stage === "syntax" || e.stage === "lexical")).toBe(true);
    });

    it("reports a missing expression after an operator", () => {
      const { errors } = parse(`workflow "Test" { when temperature > { log "x" } }`);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("recovers after a malformed statement to still report a later one", () => {
      const source = `
        workflow "Test" {
            input x : number
            when x > @ {
                log "unreachable"
            }
            log "after"
        }
      `;
      const { errors, program } = parse(source);
      expect(errors.length).toBeGreaterThan(0);
      const statements = program.workflows[0]!.statements;
      expect(statements.some((s) => s.kind === "LogStatement" && s.message === "after")).toBe(true);
    });
  });
});
