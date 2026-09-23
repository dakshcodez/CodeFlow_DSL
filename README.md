# CodeFlow

A Domain-Specific Language and Compiler for Workflow Automation.
Project for the Compiler Design Laboratory (BCSE307P).

CodeFlow is a small, statically-typed, textual DSL for expressing
conditional workflow automation logic (sensor/input-driven conditions
that trigger actions, alerts, or logs). It is implemented as a real
compiler pipeline in TypeScript: lexer &rarr; parser &rarr; AST &rarr;
semantic analysis &rarr; TAC &rarr; optimizer &rarr; execution engine.

See [`CLAUDE.md`](./CLAUDE.md) for full project instructions and
architecture, [`docs/language-spec.md`](./docs/language-spec.md) for the
formal language specification, and
[`docs/CodeFlow_Phase1_Proposal.pdf`](./docs/CodeFlow_Phase1_Proposal.pdf)
for the original Phase 1 proposal and design document.

## Project Status: Phase 3 (in progress, branch `phase3`)

Phase 1 (Problem Definition & System Design) and Phase 2 (Core Compiler
Construction — semantic analysis, symbol table, TAC generation) are
complete. Phase 3 (Optimization, Execution & Integration) has added the
optimizer. The compiler currently performs:

```
Source (.cflow) → Lexer → Token List → Recursive-Descent Parser → AST
                → Semantic Analyzer (scope + type checking, symbol table)
                → Three-Address Code Generator
                → Optimizer (constant folding, unreachable/dead-code elimination)
```

The execution engine is **not yet implemented** — it is the remaining
Phase 3 deliverable (see `CLAUDE.md` §20).

## Getting Started

```bash
npm install
npm test           # run the test suite (lexer, parser, symbols, semantic, ir, optimizer, pipeline, web UI)
npm run typecheck   # type-check src/, web/, and tests/ with no emit
npm run build       # compile src/ to dist/
```

### Compile a CodeFlow program from the console

```bash
npm run compile -- examples/cooling.cflow
```

Prints the token stream, the resulting AST as JSON, the per-workflow
symbol tables, the generated and optimized Three-Address Code, and any
lexical, syntax, or semantic errors.

### Browser visualization

```bash
npm run build:web
python3 -m http.server 8000 --directory web   # or any static file server
```

Open `web/index.html` to edit CodeFlow source and inspect the generated
tokens, AST, symbol table, and before/after Three-Address Code
interactively.

## Repository Layout

```
src/
  diagnostics/   Common CompilerError representation (cross-cutting)
  lexer/         Token kinds, Token type, lexical analyzer
  ast/           AST node type definitions
  parser/        Recursive-descent parser
  symbols/       Per-workflow symbol table
  semantic/      Semantic analyzer (scope + type checking)
  ir/            TAC instruction types, generator, and printer
  optimizer/     Constant folding, unreachable/dead-code elimination
  compiler/      Pipeline wiring (lexer + parser + semantic + IR + optimizer)
  cli.ts         Console entry point
web/             Lightweight browser visualization (tokens/AST/symbols/IR)
tests/           Unit and regression tests, mirroring src/ structure
examples/        Canonical and intentionally malformed .cflow programs
docs/            Language specification and the Phase 1 proposal PDF
```

## Example Program

```
workflow "CoolingSystem" {
    sensor temperature : number

    when temperature > 35 {
        alert "High temperature"
        action start_fan()
    }

    otherwise {
        log "Temperature normal"
    }
}
```
