import { readFileSync } from "node:fs";
import { formatCompilerError } from "./diagnostics/diagnostics.js";
import { compile } from "./compiler/pipeline.js";
import type { Token } from "./lexer/token.js";
import type { SymbolTable } from "./symbols/symbolTable.js";
import type { WorkflowIR } from "./ir/instructions.js";
import { formatWorkflowIR } from "./ir/print.js";
import { execute, formatEffect, type RuntimeInputs } from "./runtime/interpreter.js";

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

function printExecution(optimizedIR: WorkflowIR[], symbolTables: SymbolTable[], inputsJson: string | undefined): void {
  if (inputsJson === undefined) {
    console.log(
      '\n-- Execution --\nNo runtime inputs provided; skipping execution. Pass a JSON object of sensor/input\nvalues as a third argument to run the program, e.g. \'{"temperature": 38}\'.'
    );
    return;
  }

  let inputs: RuntimeInputs;
  try {
    inputs = JSON.parse(inputsJson) as RuntimeInputs;
  } catch {
    console.error(`\nInvalid JSON runtime inputs: ${inputsJson}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n-- Execution (inputs: ${JSON.stringify(inputs)}) --`);
  for (const result of execute(optimizedIR, inputs, symbolTables)) {
    console.log(`workflow "${result.workflowName}":`);
    for (const effect of result.trace) {
      console.log(`  ${formatEffect(effect)}`);
    }
    for (const error of result.errors) {
      console.log(`  ${formatCompilerError(error)}`);
      process.exitCode = 1;
    }
  }
}

function main(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run compile -- <path-to-.cflow-file> [\'{"input":"values"}\']');
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

  printExecution(optimizedIR, symbolTables, process.argv[3]);
}

main();
