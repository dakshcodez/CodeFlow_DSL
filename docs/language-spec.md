# CodeFlow Language Specification

This document is the formal Phase 1 language specification for CodeFlow,
consolidated from Section 9 of `CodeFlow_Phase1_Proposal.pdf`. It is kept
in sync with the working grammar implemented by the lexer and parser in
`src/`.

## 1. Purpose

CodeFlow is a small, statically-typed, textual Domain-Specific Language
for expressing conditional workflow logic: declaring named sensors and
inputs, testing conditions over their values, and triggering actions,
alerts, or log messages in response. It is deliberately restricted to
this domain and intentionally omits functions, loops, recursion, and
complex data structures.

## 2. Keywords

```
workflow  sensor  input  when  otherwise
action    alert   log
number    string  boolean
AND  OR  NOT
true  false
```

## 3. Identifiers

```ebnf
identifier ::= (letter | "_") (letter | digit | "_")*
```

An identifier starts with a letter or `_`, may contain letters, digits,
and `_`, and must not coincide with a reserved keyword.

## 4. Literals

| Literal Kind    | Description                              | Example              |
|-----------------|-------------------------------------------|-----------------------|
| Number literal  | An integer or decimal numeric constant.  | `35`, `10000`, `2.5`  |
| String literal  | Characters enclosed in double quotes.    | `"High temperature"`  |
| Boolean literal | One of the reserved keywords.            | `true`                |

## 5. Data Types

CodeFlow has exactly three primitive types: `number`, `string`, `boolean`.

## 6. Operators

| Category   | Operators              | Operand Types                          | Result Type |
|------------|-------------------------|------------------------------------------|-------------|
| Arithmetic | `+ - * /`               | `number, number`                          | `number`    |
| Relational | `> < >= <= == !=`       | `number, number` (`==`/`!=` also on `string`, `boolean`) | `boolean` |
| Logical    | `AND OR NOT`            | `boolean`                                 | `boolean`   |

## 7. Delimiters

| Symbol | Purpose                                                      |
|--------|---------------------------------------------------------------|
| `{ }`  | Delimit a workflow body or a when/otherwise block.            |
| `( )`  | Delimit an action's argument list or a parenthesized sub-expression. |
| `:`    | Separates a declared identifier from its type.                |
| `,`    | Separates arguments in an action's argument list.              |
| `" "`  | Delimit a string literal.                                      |

## 8. Formal Grammar (EBNF)

```ebnf
program        ::= { workflowDecl }

workflowDecl   ::= "workflow" STRING "{" { declaration } { statement } "}"

declaration    ::= ("sensor" | "input") IDENT ":" type

type           ::= "number" | "string" | "boolean"

statement      ::= whenStmt
                  | otherwiseStmt
                  | actionStmt
                  | alertStmt
                  | logStmt

whenStmt       ::= "when" expression block

otherwiseStmt  ::= "otherwise" block

block          ::= "{" { statement } "}"

actionStmt     ::= "action" IDENT "(" [ argList ] ")"

alertStmt      ::= "alert" STRING

logStmt        ::= "log" STRING

argList        ::= expression { "," expression }

expression     ::= orExpr

orExpr         ::= andExpr { "OR" andExpr }

andExpr        ::= notExpr { "AND" notExpr }

notExpr        ::= [ "NOT" ] relExpr

relExpr        ::= addExpr [ relOp addExpr ]

relOp          ::= ">" | "<" | ">=" | "<=" | "==" | "!="

addExpr        ::= mulExpr { ("+" | "-") mulExpr }

mulExpr        ::= unaryExpr { ("*" | "/") unaryExpr }

unaryExpr      ::= [ "-" ] primary

primary        ::= NUMBER | STRING | BOOLEAN | IDENT | "(" expression ")"

IDENT          ::= (letter | "_") (letter | digit | "_")*
NUMBER         ::= digit { digit } [ "." digit { digit } ]
STRING         ::= '"' { any character except '"' } '"'
BOOLEAN        ::= "true" | "false"
```

## 9. Operator Precedence and Associativity

Lowest to highest; all binary operators are left-associative.

| Precedence   | Operator(s)         | Associativity  | Description             |
|--------------|----------------------|-----------------|---------------------------|
| 1 (lowest)   | `OR`                 | Left            | Logical disjunction        |
| 2            | `AND`                | Left            | Logical conjunction        |
| 3            | `NOT`                | Right (unary)   | Logical negation            |
| 4            | `> < >= <= == !=`    | Left            | Relational comparison       |
| 5            | `+ -`                | Left            | Additive arithmetic         |
| 6            | `* /`                | Left            | Multiplicative arithmetic   |
| 7 (highest)  | `-` (unary)          | Right (unary)   | Unary numeric negation       |

The parser encodes this precedence through the layered recursive-descent
functions in `src/parser/parser.ts`, matching the grammar above
production-for-production.

## 10. Implementation Note: Comments

The lexer additionally skips `//` line comments (to end of line) as an
implementation-level lexical convenience. Comments are not part of the
CodeFlow grammar above; they never produce tokens and carry no semantic
meaning.

## 11. Example Programs

### Sensor-driven workflow

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

### Input-driven workflow

```
workflow "OrderProcessing" {
    input orderAmount : number

    when orderAmount > 5000 {
        action fraud_check()
    }

    when orderAmount > 10000 {
        action manager_approval()
    }

    action process_payment()
}
```

## 12. Semantic Rules (Phase 2)

Semantic analysis walks the AST produced by the parser and enforces
properties the context-free grammar above cannot express. A workflow is
the scope boundary: each workflow gets its own symbol table, and
identifiers declared in one workflow are not visible in another.

### Declaration and scope checking

- Every identifier referenced in a condition or action argument must
  have been declared with `sensor` or `input` in its enclosing workflow.
  Referencing an undeclared identifier is a semantic error
  (`Undefined identifier 'x'`).
- `sensor` and `input` declarations share one namespace per workflow;
  declaring the same name twice in a workflow (regardless of whether
  both are `sensor`, both `input`, or one of each) is a semantic error
  (`Duplicate declaration of 'x' in workflow "W"`).
- Action names (`action foo(...)`) are external dispatch targets, not
  declarations, and are not looked up in the symbol table.

### Type checking

CodeFlow's three primitive types (`number`, `string`, `boolean`) are
checked per operator category:

| Operators             | Required operand types      | Result type |
|------------------------|-------------------------------|--------------|
| `+ - * /`               | `number, number`               | `number`     |
| `> < >= <=`             | `number, number`                | `boolean`    |
| `== !=`                 | two operands of the same type | `boolean`    |
| `AND OR`                | `boolean, boolean`              | `boolean`    |
| unary `-`                | `number`                        | `number`     |
| `NOT`                    | `boolean`                       | `boolean`    |

The condition of a `when` statement must itself have type `boolean`.

When an operand's own type could not be resolved (because it already
produced a semantic error, such as an undefined identifier), no further
type error is reported for the expression containing it, to avoid
cascading diagnostics for a single root cause.

### Symbol table

The symbol table (`src/symbols/symbolTable.ts`) records, per declared
identifier: `name`, `kind` (`sensor` | `input`), `type`, and `scope`
(the enclosing workflow's name). It supports `insert`, `lookup`, and
`has`, and one table instance is created per workflow by the semantic
analyzer (`src/semantic/analyzer.ts`).

## 13. Three-Address Code (Phase 2)

`src/ir/generator.ts` lowers the AST into Three-Address Code (TAC), one
independently-numbered instruction sequence per workflow (workflows do
not call one another, so nothing is shared across them). The instruction
set (`src/ir/instructions.ts`) follows CLAUDE.md §15:

```
Assign | Binary | Unary | IfFalse (conditional jump) | Goto | Label | Call | Alert | Log
```

An operand is one of: a compiler-generated temporary (`t1`, `t2`, ...), a
named sensor/input variable, or a constant. `LiteralExpr` and
`IdentifierExpr` are always first materialized into a fresh temporary via
an `Assign` instruction — this keeps every downstream instruction to "at
most one operator," matching true three-address discipline and the
worked example in CLAUDE.md §15 (`t1 = temperature`, `t2 = 35`,
`t3 = t1 > t2`).

### Control flow lowering

- `when COND { BODY }` alone lowers to: evaluate `COND` into a temp,
  `IF_FALSE temp GOTO Lend`, `BODY`, `LABEL Lend`.
- `when COND { BODY } otherwise { ELSE }` — when an `otherwise`
  statement directly follows a `when` statement in the same statement
  list — lowers to a standard if/else: `IF_FALSE temp GOTO Lelse`,
  `BODY`, `GOTO Lend`, `LABEL Lelse`, `ELSE`, `LABEL Lend`. The explicit
  `GOTO Lend` after `BODY` is required so the `when` branch does not fall
  through into the `otherwise` branch.
- An `otherwise` statement that does **not** directly follow a `when`
  (the grammar allows this, since `when`/`otherwise` are independent
  statement alternatives) has no condition to fall back on, so its body
  is generated unconditionally.

### Example

The canonical cooling-system program (§11) lowers to:

```
workflow "CoolingSystem":
    t1 = temperature
    t2 = 35
    t3 = t1 > t2
    IF_FALSE t3 GOTO L1
    ALERT "High temperature"
    CALL start_fan()
    GOTO L2
LABEL L1
    LOG "Temperature normal"
LABEL L2
```

## 14. Optimization (Phase 3)

`src/optimizer/optimizer.ts` applies the three feasible optimizations
CLAUDE.md §16 scopes for this DSL, each an independently-testable pure
function `IRInstruction[] → IRInstruction[]`, run in this order by
`optimizeWorkflow`:

1. **Constant folding** (`foldConstants`) — evaluates `Binary`/`Unary`
   instructions whose operands are compile-time constants into a single
   `Assign`. Constant knowledge is tracked per temporary and reset at
   every `Label` (a control-flow merge point). Division by a constant
   zero is deliberately left unfolded, so the future execution engine's
   runtime-error handling applies uniformly rather than the optimizer
   producing `Infinity`/`NaN` as a "constant."
2. **Unreachable-code elimination** (`eliminateUnreachableCode`) — builds
   a small control-flow graph over instruction indices (fallthrough to
   `i + 1`, plus jump edges for `Goto`/`IfFalse`) and keeps only what a
   breadth-first search from the first instruction reaches. When an
   `IfFalse`'s condition is a compile-time-known boolean (typically
   because constant folding ran first), only the one edge that condition
   can actually take is included — this is what lets an always-true or
   always-false `when` eliminate its unreachable branch, without the
   pass needing to special-case CodeFlow's specific statement forms.
3. **Dead-code elimination** (`eliminateDeadCode`) — a single backward
   pass removes any `Assign`/`Binary`/`Unary` instruction whose result
   temporary is never used later. One pass (not an iterative fixed
   point) is sufficient because CodeFlow has no loops: every jump target
   is textually later than its jump, so the reverse instruction order is
   already a valid reverse-topological order, and each temporary has
   exactly one static definition.

Passes run in this order — fold, then prune unreachable branches, then
remove now-dead definitions — because each pass can create new
opportunities for the next (folding a sub-expression to a constant can
leave its operand temporaries unused; eliminating an unreachable branch
removes the only uses some temporaries had).

### Example

```
workflow "T" { when 10 > 5 { alert "always" } otherwise { log "never" } }
```

lowers to:

```
workflow "T":
    t1 = 10
    t2 = 5
    t3 = t1 > t2
    IF_FALSE t3 GOTO L1
    ALERT "always"
    GOTO L2
LABEL L1
    LOG "never"
LABEL L2
```

and optimizes to:

```
workflow "T":
    t3 = true
    IF_FALSE t3 GOTO L1
    ALERT "always"
    GOTO L2
LABEL L2
```

`10 > 5` folds to the constant `true` (`t3 = true`); the now-unused
`t1 = 10` and `t2 = 5` are removed by dead-code elimination since
nothing references them once `t3` names its value directly; and the
`otherwise` branch (`LABEL L1` / `LOG "never"`) becomes unreachable and
is removed. See `tests/optimizer/optimizer.test.ts` for further worked
examples, including `x + (1 + 2)`, where dead-code elimination removes
the now-unused temporaries for the literals `1` and `2` once their sum
folds to `3`.

## 15. Execution Engine (Phase 3)

`src/runtime/interpreter.ts` interprets a workflow's (ideally optimized)
TAC sequence directly, without reparsing source. There are no real
physical sensors or actuators (CLAUDE.md §17): the caller supplies
`sensor`/`input` values as a `RuntimeInputs` map (`{ name: value }`) at
execution time, entirely separate from `compile()` — compiling never
requires runtime values, only running does.

`execute(optimizedIR, runtimeInputs, symbolTables)` runs each workflow's
instruction sequence with a program counter over labels, maintaining:

- a `Map<tempId, value>` for temporary values,
- direct lookups into `runtimeInputs` for `Var` operands, validated
  against the declared type recorded in that workflow's `SymbolTable`
  (consulted here exactly as CLAUDE.md §12's architecture describes:
  "later stages ... also consult it for type and identifier
  information"),

and produces an ordered `trace` of the effects a real deployment would
observe: `{ kind: "Alert" | "Log" | "Action", ... }`, matching the
proposal's execution model (`Inputs: temperature = 38` →
`temperature > 35 → true` → `alert "High temperature"` →
`action start_fan()`). Actions are recorded as observable trace entries,
never real external side effects, per scope (`CLAUDE.md` §21).

### Runtime errors

Execution halts on the first runtime error and reports it as a
`stage: "runtime"` `CompilerError`, keeping whatever trace was produced
before it:

- a declared `sensor`/`input` with no value in `runtimeInputs`,
- a supplied value whose JavaScript type doesn't match the declaration
  (e.g. `sensor x : boolean` supplied the string `"yes"`),
- division by a runtime-zero divisor.

### Example

```
workflow "CoolingSystem" { sensor temperature : number; when temperature > 35 { alert "High temperature"; action start_fan() } otherwise { log "Temperature normal" } }
```

run with `{ "temperature": 38 }` produces the trace:

```
ALERT: High temperature
ACTION: start_fan()
```

run with `{ "temperature": 20 }` produces:

```
LOG: Temperature normal
```

`tests/runtime/interpreter.test.ts` also verifies that executing the
unoptimized and optimized IR of the same program with the same inputs
produces identical traces — the optimizer changes the TAC's shape, never
its observable behavior.

## 16. Phase Scope

This specification covers the full CodeFlow grammar. Phase 1 implements
lexical analysis and recursive-descent parsing, producing a preliminary
AST with basic syntax-error reporting. Phase 2 adds the semantic rules in
Section 12 and TAC generation in Section 13. Phase 3 adds the
optimization passes in Section 14 and the execution engine in Section 15,
completing the pipeline described in `CLAUDE.md` and the Phase 1
proposal.
