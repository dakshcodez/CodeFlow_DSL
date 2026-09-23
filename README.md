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

## Project Status: Phase 3 complete (branch `phase3`)

All three phases of the roadmap in `CLAUDE.md` §20 are implemented. The
compiler runs the complete pipeline end-to-end:

```
Source (.cflow) → Lexer → Token List → Recursive-Descent Parser → AST
                → Semantic Analyzer (scope + type checking, symbol table)
                → Three-Address Code Generator
                → Optimizer (constant folding, unreachable/dead-code elimination)
                → Execution Engine (runs against user-supplied sensor/input values)
                → Execution Result / Trace
```

- **Phase 1** — lexer, recursive-descent parser, preliminary AST, basic
  syntax validation.
- **Phase 2** — full semantic analyzer (declaration/scope/type checking),
  per-workflow symbol table, Three-Address Code generation.
- **Phase 3** — constant folding, unreachable- and dead-code elimination
  (each independently testable and verified against before/after IR),
  a TAC-interpreting execution engine with runtime error handling, a
  complete browser visualization covering every artifact (tokens → AST →
  symbol table → TAC → optimized TAC → execution trace), and end-to-end
  regression tests (`tests/e2e/`) covering the full `source → execution`
  pipeline for both representative and intentionally malformed programs.

Every artifact-producing stage is unit-tested independently, and
`compiler/pipeline.ts` exposes both `compile()` (static analysis through
optimized TAC) and `run()` (`compile()` plus execution against supplied
runtime inputs) as its public API.

## Getting Started

```bash
npm install
npm test           # run the test suite (lexer, parser, symbols, semantic, ir, optimizer, runtime, pipeline, e2e, web UI)
npm run typecheck   # type-check src/, web/, and tests/ with no emit
npm run build       # compile src/ to dist/
```

### Compile (and optionally run) a CodeFlow program from the console

```bash
npm run compile -- examples/cooling.cflow
npm run compile -- examples/cooling.cflow '{"temperature": 38}'
```

Prints the token stream, the resulting AST as JSON, the per-workflow
symbol tables, the generated and optimized Three-Address Code, and any
lexical, syntax, or semantic errors. Passing a JSON object of runtime
sensor/input values as a third argument also executes the program and
prints its trace (alerts, logs, action calls) or any runtime error.

### Browser visualization

```bash
npm run build:web
python3 -m http.server 8000 --directory web   # or any static file server
```

Open `web/index.html` to edit CodeFlow source, edit JSON runtime inputs,
and inspect the generated tokens, AST, symbol table, before/after
Three-Address Code, and execution trace interactively.

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
  runtime/       TAC interpreter (execution engine)
  compiler/      Pipeline wiring (lexer + parser + semantic + IR + optimizer)
  cli.ts         Console entry point
web/             Lightweight browser visualization (tokens/AST/symbols/IR/trace)
tests/           Unit tests mirroring src/ structure, plus tests/e2e/ for
                 full source-to-execution pipeline regression tests
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
