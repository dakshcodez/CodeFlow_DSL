import { compile } from "../src/compiler/pipeline.js";
import { formatCompilerError } from "../src/diagnostics/diagnostics.js";

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

function renderErrors(container: HTMLElement, errors: ReturnType<typeof compile>["errors"]): void {
  if (errors.length === 0) {
    container.innerHTML = `<p class="no-errors">No lexical or syntax errors.</p>`;
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
  const errorsOutput = document.getElementById("errors-output")!;

  const { tokens, program, errors } = compile(sourceEl.value);
  renderTokens(tokensOutput, tokens);
  astOutput.textContent = JSON.stringify(program, null, 2);
  renderErrors(errorsOutput, errors);
}

function main(): void {
  const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
  sourceEl.value = DEFAULT_SOURCE;
  document.getElementById("compile-btn")!.addEventListener("click", runCompile);
  runCompile();
}

main();
