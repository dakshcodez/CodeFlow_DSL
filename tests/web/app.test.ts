// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

function setupDom(): void {
  document.body.innerHTML = `
    <textarea id="source"></textarea>
    <button id="compile-btn">Compile</button>
    <div id="tokens-output"></div>
    <pre id="ast-output"></pre>
    <div id="symbols-output"></div>
    <div id="errors-output"></div>
  `;
}

describe("web visualization app", () => {
  beforeEach(() => {
    vi.resetModules();
    setupDom();
  });

  it("renders tokens, AST, symbol table, and a no-errors message for the default source on load", async () => {
    await import("../../web/app.js");

    const tokensOutput = document.getElementById("tokens-output")!;
    const astOutput = document.getElementById("ast-output")!;
    const symbolsOutput = document.getElementById("symbols-output")!;
    const errorsOutput = document.getElementById("errors-output")!;

    expect(tokensOutput.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
    expect(astOutput.textContent).toContain('"kind": "Program"');
    expect(astOutput.textContent).toContain("CoolingSystem");
    expect(symbolsOutput.textContent).toContain("CoolingSystem");
    expect(symbolsOutput.textContent).toContain("temperature");
    expect(errorsOutput.querySelector(".no-errors")).not.toBeNull();
  });

  it("re-renders tokens, AST, symbol table, and errors when Compile is clicked with edited source", async () => {
    await import("../../web/app.js");

    const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
    const compileBtn = document.getElementById("compile-btn")!;
    const astOutput = document.getElementById("ast-output")!;
    const errorsOutput = document.getElementById("errors-output")!;

    sourceEl.value = `workflow "Broken" {`;
    compileBtn.dispatchEvent(new Event("click"));

    expect(astOutput.textContent).toContain('"workflows": []');
    expect(errorsOutput.querySelectorAll(".error-item").length).toBeGreaterThan(0);
    expect(errorsOutput.querySelector(".no-errors")).toBeNull();
  });

  it("reports a semantic error for a source with an undefined identifier", async () => {
    await import("../../web/app.js");

    const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
    const compileBtn = document.getElementById("compile-btn")!;
    const errorsOutput = document.getElementById("errors-output")!;

    sourceEl.value = `workflow "T" { when missing > 1 { log "x" } }`;
    compileBtn.dispatchEvent(new Event("click"));

    expect(errorsOutput.textContent).toContain("Undefined identifier 'missing'");
  });
});
