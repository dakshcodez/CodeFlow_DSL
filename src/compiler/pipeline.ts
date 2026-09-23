import type { CompilerError } from "../diagnostics/diagnostics.js";
import { Lexer } from "../lexer/lexer.js";
import type { Token } from "../lexer/token.js";
import { Parser } from "../parser/parser.js";
import type { Program } from "../ast/nodes.js";
import { analyze } from "../semantic/analyzer.js";
import type { SymbolTable } from "../symbols/symbolTable.js";

export interface CompileResult {
  tokens: Token[];
  program: Program;
  symbolTables: SymbolTable[];
  errors: CompilerError[];
}

/**
 * Runs the CodeFlow pipeline: lexical analysis, recursive-descent parsing,
 * and semantic analysis (declaration/scope/type checking over a symbol
 * table). IR generation, optimization, and execution are not yet
 * implemented (Phase 3). Semantic analysis always runs over whatever
 * program the parser produced, even if earlier stages reported errors,
 * so that as many diagnostics as possible surface in a single pass.
 */
export function compile(source: string): CompileResult {
  const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
  const { program, errors: parseErrors } = new Parser(tokens).parse();
  const { symbolTables, errors: semanticErrors } = analyze(program);
  return { tokens, program, symbolTables, errors: [...lexErrors, ...parseErrors, ...semanticErrors] };
}
