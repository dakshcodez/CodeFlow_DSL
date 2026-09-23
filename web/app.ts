import { compile } from "../src/compiler/pipeline.js";
import { formatCompilerError } from "../src/diagnostics/diagnostics.js";
import type { SymbolTable } from "../src/symbols/symbolTable.js";
import type { WorkflowIR } from "../src/ir/instructions.js";
import { formatWorkflowIR } from "../src/ir/print.js";
import { execute, formatEffect, type RuntimeInputs, type WorkflowExecutionResult } from "../src/runtime/interpreter.js";

const DEFAULT_SOURCE = `workflow "CoolingSystem" {
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

const DEFAULT_INPUTS = `{
  "temperature": 38
}`;

let lastOptimizedIR: WorkflowIR[] = [];
let lastSymbolTables: SymbolTable[] = [];

function renderTokens(container: HTMLElement, tokens: ReturnType<typeof compile>["tokens"]): void {
  const table = document.createElement("table");
  table.className = "token-table";
  table.innerHTML = "<thead><tr><th>Line:Col</th><th>Kind</th><th>Lexeme</th></tr></thead>";
  const tbody = document.createElement("tbody");
  for (const token of tokens) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${token.line}:${token.column}</td><td>${token.kind}</td><td>${JSON.stringify(token.lexeme)}</td>`;
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.replaceChildren(table);
}

function renderSymbolTables(container: HTMLElement, symbolTables: SymbolTable[]): void {
  if (symbolTables.length === 0) {
    container.innerHTML = `<p>No workflows.</p>`;
    return;
  }
  const sections = symbolTables.map((table) => {
    const section = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = `workflow "${table.scope}"`;
    section.appendChild(heading);

    if (table.symbols.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "(no declarations)";
      section.appendChild(empty);
      return section;
    }

    const tableEl = document.createElement("table");
    tableEl.className = "token-table";
    tableEl.innerHTML = "<thead><tr><th>Name</th><th>Kind</th><th>Type</th></tr></thead>";
    const tbody = document.createElement("tbody");
    for (const symbol of table.symbols) {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${symbol.name}</td><td>${symbol.kind}</td><td>${symbol.type}</td>`;
      tbody.appendChild(row);
    }
    tableEl.appendChild(tbody);
    section.appendChild(tableEl);
    return section;
  });
  container.replaceChildren(...sections);
}

function renderIR(container: HTMLElement, ir: WorkflowIR[]): void {
  if (ir.length === 0) {
    container.innerHTML = `<p>No workflows.</p>`;
    return;
  }
  const pre = document.createElement("pre");
  pre.className = "output";
  pre.textContent = ir.map(formatWorkflowIR).join("\n\n");
  container.replaceChildren(pre);
}

function renderExecution(container: HTMLElement, results: WorkflowExecutionResult[]): void {
  if (results.length === 0) {
    container.innerHTML = `<p>No workflows.</p>`;
    return;
  }
  const sections = results.map((result) => {
    const section = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = `workflow "${result.workflowName}"`;
    section.appendChild(heading);

    if (result.trace.length === 0 && result.errors.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "(no effects)";
      section.appendChild(empty);
    }

    for (const effect of result.trace) {
      const line = document.createElement("div");
      line.textContent = formatEffect(effect);
      section.appendChild(line);
    }
    for (const error of result.errors) {
      const line = document.createElement("div");
      line.className = "error-item";
      line.textContent = formatCompilerError(error);
      section.appendChild(line);
    }
    return section;
  });
  container.replaceChildren(...sections);
}

function renderErrors(container: HTMLElement, errors: ReturnType<typeof compile>["errors"]): void {
  if (errors.length === 0) {
    container.innerHTML = `<p class="no-errors">No lexical, syntax, or semantic errors.</p>`;
    return;
  }
  const items = errors.map((error) => {
    const div = document.createElement("div");
    div.className = "error-item";
    div.textContent = formatCompilerError(error);
    return div;
  });
  container.replaceChildren(...items);
}

function runCompile(): void {
  const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
  const tokensOutput = document.getElementById("tokens-output")!;
  const astOutput = document.getElementById("ast-output")!;
  const symbolsOutput = document.getElementById("symbols-output")!;
  const irOutput = document.getElementById("ir-output")!;
  const optimizedIrOutput = document.getElementById("optimized-ir-output")!;
  const errorsOutput = document.getElementById("errors-output")!;
  const executionOutput = document.getElementById("execution-output")!;

  const { tokens, program, symbolTables, ir, optimizedIR, errors } = compile(sourceEl.value);
  renderTokens(tokensOutput, tokens);
  astOutput.textContent = JSON.stringify(program, null, 2);
  renderSymbolTables(symbolsOutput, symbolTables);
  renderIR(irOutput, ir);
  renderIR(optimizedIrOutput, optimizedIR);
  renderErrors(errorsOutput, errors);

  lastOptimizedIR = optimizedIR;
  lastSymbolTables = symbolTables;
  executionOutput.innerHTML = `<p>Source changed since the last run &mdash; click Run to execute.</p>`;
}

function runExecute(): void {
  const inputsEl = document.getElementById("inputs") as HTMLTextAreaElement;
  const executionOutput = document.getElementById("execution-output")!;

  let inputs: RuntimeInputs;
  try {
    inputs = JSON.parse(inputsEl.value) as RuntimeInputs;
  } catch (err) {
    executionOutput.innerHTML = `<div class="error-item">Invalid JSON inputs: ${(err as Error).message}</div>`;
    return;
  }

  renderExecution(executionOutput, execute(lastOptimizedIR, inputs, lastSymbolTables));
}

function main(): void {
  const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
  const inputsEl = document.getElementById("inputs") as HTMLTextAreaElement;
  sourceEl.value = DEFAULT_SOURCE;
  inputsEl.value = DEFAULT_INPUTS;
  document.getElementById("compile-btn")!.addEventListener("click", runCompile);
  document.getElementById("run-btn")!.addEventListener("click", runExecute);
  runCompile();
  runExecute();
}

main();
