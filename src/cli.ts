import { readFileSync } from "node:fs";
import { formatCompilerError } from "./diagnostics/diagnostics.js";
import { compile } from "./compiler/pipeline.js";
import type { Token } from "./lexer/token.js";
import type { SymbolTable } from "./symbols/symbolTable.js";
import type { WorkflowIR } from "./ir/instructions.js";
import { formatWorkflowIR } from "./ir/print.js";

function printTokens(tokens: Token[]): void {
  console.log(`\n-- Tokens (${tokens.length}) --`);
  for (const token of tokens) {
    console.log(
      `${String(token.line).padStart(3)}:${String(token.column).padEnd(3)} ${token.kind.padEnd(14)} ${JSON.stringify(token.lexeme)}`
    );
  }
}

function printSymbolTables(symbolTables: SymbolTable[]): void {
  console.log(`\n-- Symbol Tables (${symbolTables.length} workflow scope(s)) --`);
  for (const table of symbolTables) {
    console.log(`workflow "${table.scope}":`);
    if (table.symbols.length === 0) {
      console.log("  (no declarations)");
      continue;
    }
    for (const symbol of table.symbols) {
      console.log(`  ${symbol.name.padEnd(16)} ${symbol.kind.padEnd(8)} ${symbol.type}`);
    }
  }
}

function printIR(heading: string, ir: WorkflowIR[]): void {
  console.log(`\n-- ${heading} (${ir.length} workflow(s)) --`);
  for (const workflowIR of ir) {
    console.log(formatWorkflowIR(workflowIR));
  }
}

function main(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run compile -- <path-to-.cflow-file>");
    process.exitCode = 1;
    return;
  }

  const source = readFileSync(filePath, "utf-8");
  const { tokens, program, symbolTables, ir, optimizedIR, errors } = compile(source);

  printTokens(tokens);

  console.log("\n-- AST --");
  console.log(JSON.stringify(program, null, 2));

  printSymbolTables(symbolTables);
  printIR("Three-Address Code", ir);
  printIR("Optimized Three-Address Code", optimizedIR);

  if (errors.length > 0) {
    console.log(`\n-- Errors (${errors.length}) --`);
    for (const error of errors) {
      console.log(formatCompilerError(error));
    }
    process.exitCode = 1;
  } else {
    console.log("\nNo lexical, syntax, or semantic errors.");
  }
}

main();
