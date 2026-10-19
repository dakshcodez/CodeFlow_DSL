// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

function setupDom(): void {
  document.body.innerHTML = `
    <textarea id="source"></textarea>
    <button id="compile-btn">Compile</button>
    <textarea id="inputs"></textarea>
    <button id="run-btn">Run</button>
    <div id="tokens-output"></div>
    <pre id="ast-output"></pre>
    <div id="symbols-output"></div>
    <div id="ir-output"></div>
    <div id="optimized-ir-output"></div>
    <div id="errors-output"></div>
    <div id="execution-output"></div>
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
    const irOutput = document.getElementById("ir-output")!;
    const optimizedIrOutput = document.getElementById("optimized-ir-output")!;
    const errorsOutput = document.getElementById("errors-output")!;

    expect(tokensOutput.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
    expect(astOutput.textContent).toContain('"kind": "Program"');
    expect(astOutput.textContent).toContain("CoolingSystem");
    expect(symbolsOutput.textContent).toContain("CoolingSystem");
    expect(symbolsOutput.textContent).toContain("temperature");
    expect(irOutput.textContent).toContain("t1 = temperature");
    expect(irOutput.textContent).toContain("IF_FALSE t3 GOTO L1");
    // Nothing is statically foldable in the default source, so the
    // optimized TAC panel should match the unoptimized one.
    expect(optimizedIrOutput.textContent).toBe(irOutput.textContent);
    expect(errorsOutput.querySelector(".no-errors")).not.toBeNull();

    // main() also runs execution once on load, against the default inputs.
    const executionOutput = document.getElementById("execution-output")!;
    expect(executionOutput.textContent).toContain("ALERT: High temperature");
    expect(executionOutput.textContent).toContain("ACTION: start_fan()");
  });

  it("re-executes with edited runtime inputs when Run is clicked", async () => {
    await import("../../web/app.js");

    const inputsEl = document.getElementById("inputs") as HTMLTextAreaElement;
    const runBtn = document.getElementById("run-btn")!;
    const executionOutput = document.getElementById("execution-output")!;

    inputsEl.value = `{"temperature": 20}`;
    runBtn.dispatchEvent(new Event("click"));

    expect(executionOutput.textContent).toContain("LOG: Temperature normal");
    expect(executionOutput.textContent).not.toContain("ALERT");
  });

  it("shows a runtime error when a required input is missing", async () => {
    await import("../../web/app.js");

    const inputsEl = document.getElementById("inputs") as HTMLTextAreaElement;
    const runBtn = document.getElementById("run-btn")!;
    const executionOutput = document.getElementById("execution-output")!;

    inputsEl.value = `{}`;
    runBtn.dispatchEvent(new Event("click"));

    expect(executionOutput.textContent).toContain("No runtime value provided for 'temperature'");
  });

  it("shows an inline error for invalid JSON inputs instead of throwing", async () => {
    await import("../../web/app.js");

    const inputsEl = document.getElementById("inputs") as HTMLTextAreaElement;
    const runBtn = document.getElementById("run-btn")!;
    const executionOutput = document.getElementById("execution-output")!;

    inputsEl.value = `{not valid json`;
    runBtn.dispatchEvent(new Event("click"));

    expect(executionOutput.querySelector(".error-item")).not.toBeNull();
    expect(executionOutput.textContent).toContain("Invalid JSON inputs");
  });

  it("prompts to re-run after Compile is clicked, since the source changed", async () => {
    await import("../../web/app.js");

    const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
    const compileBtn = document.getElementById("compile-btn")!;
    const executionOutput = document.getElementById("execution-output")!;

    sourceEl.value = `workflow "Other" { action a() }`;
    compileBtn.dispatchEvent(new Event("click"));

    expect(executionOutput.textContent).toContain("click Run to execute");
  });

  it("shows a smaller optimized TAC than the unoptimized TAC for a statically-foldable condition", async () => {
    await import("../../web/app.js");

    const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
    const compileBtn = document.getElementById("compile-btn")!;
    const irOutput = document.getElementById("ir-output")!;
    const optimizedIrOutput = document.getElementById("optimized-ir-output")!;

    sourceEl.value = `workflow "T" { when 10 > 5 { alert "always" } otherwise { log "never" } }`;
    compileBtn.dispatchEvent(new Event("click"));

    expect(irOutput.textContent).toContain('LOG "never"');
    expect(optimizedIrOutput.textContent).not.toContain('LOG "never"');
    expect(optimizedIrOutput.textContent).toContain("t3 = true");
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
