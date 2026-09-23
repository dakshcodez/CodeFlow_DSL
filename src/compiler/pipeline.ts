import type { CompilerError } from "../diagnostics/diagnostics.js";
import { Lexer } from "../lexer/lexer.js";
import type { Token } from "../lexer/token.js";
import { Parser } from "../parser/parser.js";
import type { Program } from "../ast/nodes.js";
import { analyze } from "../semantic/analyzer.js";
import type { SymbolTable } from "../symbols/symbolTable.js";
import { generateIR } from "../ir/generator.js";
import type { WorkflowIR } from "../ir/instructions.js";
import { optimize } from "../optimizer/optimizer.js";

export interface CompileResult {
  tokens: Token[];
  program: Program;
  symbolTables: SymbolTable[];
  ir: WorkflowIR[];
  optimizedIR: WorkflowIR[];
  errors: CompilerError[];
}

/**
 * Runs the CodeFlow pipeline: lexical analysis, recursive-descent parsing,
 * semantic analysis (declaration/scope/type checking over a symbol
 * table), Three-Address Code generation, and optimization (constant
 * folding, unreachable- and dead-code elimination). Execution is not yet
 * implemented (Phase 3). Every stage always runs over whatever artifact
 * the previous stage produced, even if earlier stages reported errors,
 * so that as many diagnostics as possible surface in a single pass and
 * every intermediate artifact stays inspectable.
 */
export function compile(source: string): CompileResult {
  const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
  const { program, errors: parseErrors } = new Parser(tokens).parse();
  const { symbolTables, errors: semanticErrors } = analyze(program);
  const ir = generateIR(program);
  const optimizedIR = optimize(ir);
  return {
    tokens,
    program,
    symbolTables,
    ir,
    optimizedIR,
    errors: [...lexErrors, ...parseErrors, ...semanticErrors],
  };
}
