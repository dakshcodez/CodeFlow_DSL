import { describe, expect, it } from "vitest";
import { SymbolTable } from "../../src/symbols/symbolTable.js";

const LOC = { line: 1, column: 1 };

describe("SymbolTable", () => {
  it("inserts and looks up a symbol", () => {
    const table = new SymbolTable("CoolingSystem");
    const inserted = table.insert({ name: "temperature", kind: "sensor", type: "number", loc: LOC });
    expect(inserted).toBe(true);

    const entry = table.lookup("temperature");
    expect(entry).toEqual({
      name: "temperature",
      kind: "sensor",
      type: "number",
      scope: "CoolingSystem",
      loc: LOC,
    });
  });

  it("returns undefined for an unknown identifier", () => {
    const table = new SymbolTable("CoolingSystem");
    expect(table.lookup("missing")).toBeUndefined();
    expect(table.has("missing")).toBe(false);
  });

  it("rejects a duplicate declaration and leaves the original entry intact", () => {
    const table = new SymbolTable("OrderProcessing");
    expect(table.insert({ name: "amount", kind: "input", type: "number", loc: LOC })).toBe(true);
    expect(table.insert({ name: "amount", kind: "input", type: "string", loc: { line: 5, column: 1 } })).toBe(
      false
    );
    expect(table.lookup("amount")).toMatchObject({ type: "number", loc: LOC });
  });

  it("treats sensor and input declarations as sharing one namespace", () => {
    const table = new SymbolTable("T");
    expect(table.insert({ name: "x", kind: "sensor", type: "number", loc: LOC })).toBe(true);
    expect(table.insert({ name: "x", kind: "input", type: "boolean", loc: LOC })).toBe(false);
  });

  it("exposes all inserted symbols", () => {
    const table = new SymbolTable("T");
    table.insert({ name: "a", kind: "sensor", type: "number", loc: LOC });
    table.insert({ name: "b", kind: "input", type: "string", loc: LOC });
    expect(table.symbols.map((s) => s.name)).toEqual(["a", "b"]);
  });

  it("keeps separate scopes independent", () => {
    const tableA = new SymbolTable("A");
    const tableB = new SymbolTable("B");
    tableA.insert({ name: "x", kind: "sensor", type: "number", loc: LOC });
    expect(tableB.has("x")).toBe(false);
    expect(tableA.scope).toBe("A");
    expect(tableB.scope).toBe("B");
  });
});
