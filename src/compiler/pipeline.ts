import type { CompilerError } from "../diagnostics/diagnostics.js";
import { Lexer } from "../lexer/lexer.js";
import type { Token } from "../lexer/token.js";
import { Parser } from "../parser/parser.js";
import type { Program } from "../ast/nodes.js";

export interface CompileResult {
  tokens: Token[];
  program: Program;
  errors: CompilerError[];
}

/**
 * Runs the Phase 1 CodeFlow pipeline: lexical analysis followed by
 * recursive-descent parsing. Semantic analysis, IR generation,
 * optimization, and execution are not yet implemented (Phases 2 and 3).
 */
export function compile(source: string): CompileResult {
  const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
  const { program, errors: parseErrors } = new Parser(tokens).parse();
  return { tokens, program, errors: [...lexErrors, ...parseErrors] };
}
