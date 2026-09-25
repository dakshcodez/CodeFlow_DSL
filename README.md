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
formal language specification,
[`docs/CodeFlow_Phase1_Proposal.pdf`](./docs/CodeFlow_Phase1_Proposal.pdf)
for the original Phase 1 proposal and design document, and
[`docs/CodeFlow_Phase2_Report.pdf`](./docs/CodeFlow_Phase2_Report.pdf) for
the Phase 2 report covering semantic analysis, the symbol table, and TAC
generation (source: [`docs/Phase2_Report.html`](./docs/Phase2_Report.html)).

## Project Status: Phase 2 (in progress, branch `phase2`)

Phase 1 (Problem Definition & System Design) is complete. Phase 2 (Core
Compiler Construction) adds semantic analysis, the symbol table, and TAC
generation on top of it. The compiler currently performs:

```
Source (.cflow) → Lexer → Token List → Recursive-Descent Parser → AST
                → Semantic Analyzer (scope + type checking, symbol table)
                → Three-Address Code Generator
```

Optimization and execution are **not yet implemented** — they are
planned for Phase 3 (see `CLAUDE.md` §20).

## Getting Started

```bash
npm install
npm test           # run the test suite (lexer, parser, symbols, semantic, ir, pipeline, web UI)
npm run typecheck   # type-check src/, web/, and tests/ with no emit
npm run build       # compile src/ to dist/
```

### Compile a CodeFlow program from the console

```bash
npm run compile -- examples/cooling.cflow
```

Prints the token stream, the resulting AST as JSON, the per-workflow
symbol tables, the generated Three-Address Code, and any lexical,
syntax, or semantic errors.

### Browser visualization

```bash
npm run build:web
python3 -m http.server 8000 --directory web   # or any static file server
```

Open `web/index.html` to edit CodeFlow source and inspect the generated
tokens, AST, symbol table, and Three-Address Code interactively.

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
  compiler/      Pipeline wiring (lexer + parser + semantic analyzer + IR)
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
