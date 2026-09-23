import { readFileSync } from "node:fs";
import { formatCompilerError } from "./diagnostics/diagnostics.js";
import { compile } from "./compiler/pipeline.js";
import type { Token } from "./lexer/token.js";

function printTokens(tokens: Token[]): void {
  console.log(`\n-- Tokens (${tokens.length}) --`);
  for (const token of tokens) {
    console.log(
      `${String(token.line).padStart(3)}:${String(token.column).padEnd(3)} ${token.kind.padEnd(14)} ${JSON.stringify(token.lexeme)}`
    );
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
  const { tokens, program, errors } = compile(source);

  printTokens(tokens);

  console.log("\n-- AST --");
  console.log(JSON.stringify(program, null, 2));

  if (errors.length > 0) {
    console.log(`\n-- Errors (${errors.length}) --`);
    for (const error of errors) {
      console.log(formatCompilerError(error));
    }
    process.exitCode = 1;
  } else {
    console.log("\nNo lexical or syntax errors.");
  }
}

main();
