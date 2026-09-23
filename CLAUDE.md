# CodeFlow --- Claude Code Project Instructions

## 1. Project Identity

**Project:** CodeFlow\
**Full title:** A Domain-Specific Language and Compiler for Workflow
Automation\
**Course:** Compiler Design Laboratory (BCSE307P)\
**Project type:** Individual project\
**Primary implementation language:** TypeScript\
**Execution target:** Node.js / TypeScript interpreter\
**Visualization:** Lightweight browser-based interface using HTML, CSS,
and JavaScript/TypeScript

CodeFlow is a small, statically typed, textual Domain-Specific Language
(DSL) for expressing conditional workflow automation. It is not intended
to be a general-purpose programming language.

The project must demonstrate a real compiler pipeline:

``` text
CodeFlow Source
      ↓
Lexical Analysis
      ↓
Token Stream
      ↓
Recursive-Descent Parsing
      ↓
AST
      ↓
Semantic Analysis
      ↓
Symbol Table
      ↓
Three-Address Code (TAC)
      ↓
Optimization
      ↓
Optimized TAC
      ↓
Execution Engine
      ↓
Execution Result / Trace
```

Two cross-cutting concerns span the pipeline:

``` text
Error Handling
Visualization / Compiler Explorer
```

The Phase 1 proposal defines this architecture and explicitly scopes
semantic analysis and TAC generation for Phase 2, with optimization and
execution planned for Phase 3.

------------------------------------------------------------------------

## 2. Source of Truth

The authoritative project specification is the Phase 1 proposal:

> `CodeFlow_Phase1_Proposal.pdf`

When implementing CodeFlow, preserve the language terminology, grammar,
semantics, module boundaries, and scope defined there unless the project
owner explicitly asks for a change.

The proposal defines:

-   the CodeFlow DSL
-   lexical rules
-   grammar
-   operator precedence
-   semantic requirements
-   compiler architecture
-   module responsibilities
-   technology choices
-   three-phase implementation roadmap
-   initial prototype scope
-   planned optimizations
-   execution model

Do not silently redesign the language because a different design seems
more convenient.

If an implementation decision is not specified by the proposal, choose
the simplest design consistent with the compiler-learning objectives and
existing architecture.

------------------------------------------------------------------------

# 3. Core Project Goal

Build a complete educational compiler and execution environment for
CodeFlow.

The compiler should make the transformation from source code to
execution observable.

For a valid program, the user should eventually be able to inspect:

1.  Source code
2.  Tokens
3.  AST
4.  Symbol table
5.  Semantic diagnostics
6.  Generated TAC
7.  Optimized TAC
8.  Execution trace/result

The project is not merely a parser or an interpreter. The compiler
stages themselves are the primary subject of the project.

------------------------------------------------------------------------

# 4. CodeFlow Language

## 4.1 Domain

CodeFlow is designed for conditional workflow logic such as:

-   sensor-driven automation
-   input-driven business rules
-   alerts
-   logs
-   simple automated actions
-   conditional branching

Examples include environmental monitoring, order-processing checks,
notification rules, and simple automation logic.

The DSL deliberately avoids general-purpose language features that are
unnecessary for this domain.

------------------------------------------------------------------------

## 4.2 Keywords

Reserved keywords:

``` text
workflow
sensor
input
when
otherwise
action
alert
log
number
string
boolean
AND
OR
NOT
true
false
```

Do not treat these as ordinary identifiers.

------------------------------------------------------------------------

## 4.3 Identifiers

Identifiers:

``` ebnf
identifier ::= (letter | "_") (letter | digit | "_")*
```

An identifier:

-   starts with a letter or `_`
-   may contain letters, digits, and `_`
-   must not be a reserved keyword

Identifiers are used for:

-   workflow-scoped sensors
-   workflow-scoped inputs
-   action names

------------------------------------------------------------------------

## 4.4 Literals

### Number

Examples:

``` text
35
10000
2.5
```

Grammar:

``` ebnf
NUMBER ::= digit { digit } [ "." digit { digit } ]
```

### String

Example:

``` text
"High temperature"
```

Grammar:

``` ebnf
STRING ::= '"' { any character except '"' } '"'
```

### Boolean

``` text
true
false
```

------------------------------------------------------------------------

## 4.5 Types

CodeFlow has exactly three primitive types:

``` text
number
string
boolean
```

### `number`

Numeric values including integers and decimals.

### `string`

Textual values, primarily used for alert/log messages and expression
values where applicable.

### `boolean`

Logical true/false values.

Do not introduce arrays, objects, classes, generics, or other complex
types unless explicitly requested.

------------------------------------------------------------------------

# 5. Operators

## Arithmetic

``` text
+
-
*
/
```

Operands:

``` text
number, number
```

Result:

``` text
number
```

## Relational

``` text
>
<
>=
<=
==
!=
```

`>`, `<`, `>=`, and `<=` operate on numbers.

`==` and `!=` may compare values of compatible primitive types,
including strings and booleans.

Result:

``` text
boolean
```

## Logical

``` text
AND
OR
NOT
```

Operands:

``` text
boolean
```

Result:

``` text
boolean
```

------------------------------------------------------------------------

# 6. Operator Precedence

Precedence from lowest to highest:

  Level   Operators           Associativity
  ------- ------------------- ---------------
  1       `OR`                Left
  2       `AND`               Left
  3       `NOT`               Right
  4       `> < >= <= == !=`   Left
  5       `+ -`               Left
  6       `* /`               Left
  7       unary `-`           Right

The parser should encode this precedence through separate
recursive-descent parsing functions rather than relying on ad-hoc
precedence handling.

Expected structure:

``` text
parseExpression
  → parseOr
    → parseAnd
      → parseNot
        → parseRelational
          → parseAdditive
            → parseMultiplicative
              → parseUnary
                → parsePrimary
```

------------------------------------------------------------------------

# 7. Grammar

The Phase 1 working grammar is:

``` ebnf
program ::= { workflowDecl }

workflowDecl ::= "workflow" STRING "{" { declaration } { statement } "}"

declaration ::= ("sensor" | "input") IDENT ":" type

type ::= "number" | "string" | "boolean"

statement ::= whenStmt
            | otherwiseStmt
            | actionStmt
            | alertStmt
            | logStmt

whenStmt ::= "when" expression block

otherwiseStmt ::= "otherwise" block

block ::= "{" { statement } "}"

actionStmt ::= "action" IDENT "(" [ argList ] ")"

alertStmt ::= "alert" STRING

logStmt ::= "log" STRING

argList ::= expression { "," expression }

expression ::= orExpr

orExpr ::= andExpr { "OR" andExpr }

andExpr ::= notExpr { "AND" notExpr }

notExpr ::= [ "NOT" ] relExpr

relExpr ::= addExpr [ relOp addExpr ]

relOp ::= ">" | "<" | ">=" | "<=" | "==" | "!="

addExpr ::= mulExpr { ("+" | "-") mulExpr }

mulExpr ::= unaryExpr { ("*" | "/") unaryExpr }

unaryExpr ::= [ "-" ] primary

primary ::= NUMBER
          | STRING
          | BOOLEAN
          | IDENT
          | "(" expression ")"

IDENT ::= (letter | "_") (letter | digit | "_")*

NUMBER ::= digit { digit } [ "." digit { digit } ]

STRING ::= '"' { any character except '"' } '"'

BOOLEAN ::= "true" | "false"
```

Do not modify this grammar casually. If the grammar must change, update
the language specification and tests together.

------------------------------------------------------------------------

# 8. Canonical Example Programs

## Sensor-driven workflow

``` text
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

## Input-driven workflow

``` text
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

These examples should remain valid regression tests.

------------------------------------------------------------------------

# 9. Compiler Architecture

The project consists of eight major modules.

## 9.1 Lexer

### Responsibility

Convert raw source text into a classified token stream.

### Input

``` text
CodeFlow source text
```

### Output

``` text
Token[]
```

### Responsibilities

-   recognize keywords
-   recognize identifiers
-   recognize numbers
-   recognize strings
-   recognize booleans
-   recognize operators
-   recognize delimiters
-   track line/column positions
-   skip whitespace
-   skip comments if comments are supported by the implementation
-   report lexical errors

### Lexical errors include

-   illegal characters
-   malformed numeric literals
-   unterminated strings

Every token should carry enough source-location information to support
useful diagnostics.

------------------------------------------------------------------------

# 10. Token Design

Prefer a discriminated-union TypeScript representation.

Conceptually:

``` ts
type Token = {
  kind: TokenKind;
  lexeme: string;
  line: number;
  column: number;
  start: number;
  end: number;
};
```

The exact representation may vary, but source location must not be
discarded.

Avoid using raw strings throughout the parser when a proper token kind
can be represented explicitly.

------------------------------------------------------------------------

# 11. Parser

Use a **hand-written recursive-descent parser**.

The grammar is small and LL(1)-friendly.

Each grammar production should correspond to a clear parser
method/function where practical.

Example conceptual structure:

``` text
parseProgram()
parseWorkflow()
parseDeclaration()
parseStatement()
parseWhen()
parseOtherwise()
parseAction()
parseAlert()
parseLog()
parseExpression()
parseOr()
parseAnd()
parseNot()
parseRelational()
parseAdditive()
parseMultiplicative()
parseUnary()
parsePrimary()
```

The parser should:

-   consume tokens
-   validate grammar
-   construct the AST
-   produce useful syntax errors
-   avoid embedding semantic/type checking logic

Keep syntax analysis separate from semantic analysis.

------------------------------------------------------------------------

# 12. AST

The AST is the shared structural representation used by later compiler
stages.

It should represent semantic structure rather than unnecessary concrete
syntax.

Likely node categories include:

``` text
Program
Workflow
Declaration
WhenStatement
OtherwiseStatement
ActionStatement
AlertStatement
LogStatement

BinaryExpression
UnaryExpression
LiteralExpression
IdentifierExpression
```

The exact class/interface hierarchy should remain simple.

Prefer a discriminated-union AST design in TypeScript.

Example conceptual shape:

``` ts
type Expr =
  | LiteralExpr
  | IdentifierExpr
  | UnaryExpr
  | BinaryExpr;
```

Use the AST as the boundary between parsing and subsequent compiler
stages.

------------------------------------------------------------------------

# 13. Semantic Analysis

Semantic analysis is planned for Phase 2.

It must walk the AST and enforce properties that the context-free
grammar cannot express.

## Required checks

### Declaration checking

Every referenced sensor/input must have been declared in the enclosing
workflow.

### Duplicate declarations

Detect duplicate identifiers in the same workflow scope.

### Scope checking

Each workflow creates its own declaration scope.

### Type checking

Reject incompatible operations.

Examples:

``` text
number > number       ✓
number + number       ✓
boolean AND boolean   ✓
string == string      ✓
boolean == boolean    ✓
```

Invalid examples:

``` text
"hello" > 10
true + 5
10 AND 5
temperature AND 10
```

### Literal/type compatibility

Ensure expressions and declarations conform to CodeFlow's type rules.

Semantic errors must include source locations.

Do not move these checks into the parser simply because it is
convenient.

------------------------------------------------------------------------

# 14. Symbol Table

The symbol table records:

``` text
name
kind
type
scope
```

Supported declaration kinds:

``` text
sensor
input
```

Required operations:

``` text
insert
lookup
scope resolution
```

A workflow is the scope boundary.

The symbol table should be independently testable.

Do not make the symbol table a global bag of variables without scope
semantics.

------------------------------------------------------------------------

# 15. Intermediate Representation

CodeFlow uses **Three-Address Code (TAC)**.

TAC should represent:

-   expression evaluation
-   temporary values
-   conditional branching
-   action dispatch
-   alert dispatch
-   log dispatch

Conceptually:

``` text
t1 = temperature
t2 = 35
t3 = t1 > t2
IF_FALSE t3 GOTO L1
ALERT "High temperature"
CALL start_fan
LABEL L1
LOG "Temperature normal"
```

The exact TAC instruction representation should be structured rather
than arbitrary strings where possible.

For example, prefer:

``` ts
type IRInstruction =
  | AssignInstruction
  | BinaryInstruction
  | UnaryInstruction
  | ConditionalJumpInstruction
  | JumpInstruction
  | LabelInstruction
  | CallInstruction
  | AlertInstruction
  | LogInstruction;
```

This makes optimization and execution much easier.

------------------------------------------------------------------------

# 16. Optimization

Optimization is planned for Phase 3.

Only implement optimizations that make sense for this DSL.

Required planned optimizations:

### Constant folding

Transform:

``` text
10 + 20
```

into:

``` text
30
```

and similarly for statically evaluable comparisons.

### Dead-code elimination

Remove computations whose results are never used.

### Unreachable-code elimination

Remove code that cannot execute due to an unconditional branch or
statically false condition.

Do not implement exaggerated compiler optimizations such as:

-   register allocation
-   instruction scheduling
-   inter-procedural optimization
-   native machine-code optimization

They are explicitly outside the intended scope.

------------------------------------------------------------------------

# 17. Execution Engine

Execution is planned for Phase 3.

The execution engine interprets optimized TAC.

It should:

1.  maintain runtime values
2.  evaluate expressions
3.  follow labels and branches
4.  dispatch actions
5.  emit alerts
6.  emit logs
7.  produce an execution trace/result
8.  report applicable runtime errors

There are no real physical sensors or external actuators.

Sensor/input values are supplied as runtime inputs.

Example conceptual runtime:

``` text
Inputs:
temperature = 38

Execution:
temperature > 35 → true
alert "High temperature"
action start_fan()
```

Actions should be represented as observable runtime effects, not real
external side effects.

------------------------------------------------------------------------

# 18. Error Handling

Error handling is cross-cutting.

Every diagnostic should use a common representation.

Conceptually:

``` ts
type CompilerError = {
  stage: "lexical" | "syntax" | "semantic" | "runtime";
  message: string;
  line?: number;
  column?: number;
  length?: number;
};
```

Diagnostics should be specific.

Prefer:

``` text
Semantic error at line 4, column 12:
Undefined identifier 'temperature'
```

over:

``` text
Compilation failed.
```

Syntax errors should ideally report:

``` text
expected
found
location
```

where useful.

Do not throw generic errors that destroy the compiler stage information.

------------------------------------------------------------------------

# 19. Visualization Layer

The visualization interface is a core project feature.

It should eventually expose:

``` text
Source
Tokens
AST
Symbol Table
Semantic Errors
Generated IR
Optimized IR
Execution Trace
```

The UI exists primarily to make compiler internals observable and
explainable.

Do not turn the project into a generic dashboard or workflow-management
application.

The visualization should support compiler demonstration, debugging, and
learning.

------------------------------------------------------------------------

# 20. Phase Roadmap

## Phase 1 --- Problem Definition & System Design

Already defined in the proposal:

-   problem statement
-   motivation
-   objectives
-   scope
-   language specification
-   formal grammar
-   architecture
-   module decomposition
-   technology stack
-   initial lexer/parser/AST prototype

The Phase 1 prototype covers:

``` text
Source
  ↓
Lexer
  ↓
Token List
  ↓
Basic Recursive-Descent Parser
  ↓
Preliminary AST
  ↓
Basic Syntax Validation
  ↓
Display
```

Phase 1 does NOT claim to implement:

-   semantic analysis
-   symbol-table type checking
-   IR generation
-   optimization
-   execution

Do not misrepresent these as completed features.

------------------------------------------------------------------------

## Phase 2 --- Core Compiler Construction

Implement:

1.  complete lexer
2.  complete parser
3.  full AST
4.  symbol table
5.  semantic analyzer
6.  scope checking
7.  type checking
8.  TAC generation
9.  layered error handling

Primary target:

``` text
Source
→ Tokens
→ AST
→ Semantic Validation
→ Symbol Table
→ TAC
```

------------------------------------------------------------------------

## Phase 3 --- Optimization, Execution & Integration

Implement:

1.  constant folding
2.  dead-code elimination
3.  unreachable-code elimination
4.  execution engine
5.  complete visualization
6.  integrated error display
7.  comprehensive testing
8.  before/after IR comparison
9.  final documentation

Primary target:

``` text
Source
→ Tokens
→ AST
→ Semantic Analysis
→ TAC
→ Optimized TAC
→ Execution
→ Trace
```

------------------------------------------------------------------------

# 21. Explicit Project Scope Boundaries

Do NOT introduce the following unless the project owner explicitly
changes the scope:

-   user-defined functions
-   loops
-   recursion
-   arrays
-   objects
-   classes
-   modules/imports
-   concurrency
-   distributed execution
-   networking
-   physical sensor integration
-   persistent storage
-   user accounts
-   authentication
-   enterprise workflow management
-   scheduling servers
-   role-based access control
-   native machine-code generation
-   register allocation
-   instruction scheduling
-   inter-procedural analysis
-   production-scale infrastructure

CodeFlow is an individual compiler laboratory project, not an enterprise
workflow platform.

------------------------------------------------------------------------

# 22. Recommended Repository Structure

Use a modular structure similar to:

``` text
codeflow/
├── src/
│   ├── lexer/
│   │   ├── lexer.ts
│   │   ├── token.ts
│   │   └── tokenKind.ts
│   │
│   ├── parser/
│   │   └── parser.ts
│   │
│   ├── ast/
│   │   ├── nodes.ts
│   │   └── visitor.ts
│   │
│   ├── semantic/
│   │   ├── analyzer.ts
│   │   ├── types.ts
│   │   └── errors.ts
│   │
│   ├── symbols/
│   │   └── symbolTable.ts
│   │
│   ├── ir/
│   │   ├── instructions.ts
│   │   └── generator.ts
│   │
│   ├── optimizer/
│   │   └── optimizer.ts
│   │
│   ├── runtime/
│   │   └── interpreter.ts
│   │
│   ├── diagnostics/
│   │   └── diagnostics.ts
│   │
│   └── compiler/
│       └── pipeline.ts
│
├── web/
│   ├── index.html
│   ├── styles.css
│   └── app.ts
│
├── tests/
│   ├── lexer/
│   ├── parser/
│   ├── semantic/
│   ├── ir/
│   ├── optimizer/
│   └── runtime/
│
├── examples/
│   ├── cooling.cflow
│   ├── order-processing.cflow
│   └── errors/
│
├── docs/
│
├── package.json
├── tsconfig.json
├── README.md
└── CLAUDE.md
```

The exact directory names can change if an existing repository already
has a structure. Do not reorganize the repository unnecessarily.

------------------------------------------------------------------------

# 23. TypeScript Design Principles

## Prefer explicit types

Compiler structures should be strongly typed.

Good:

``` ts
type Expr =
  | LiteralExpr
  | IdentifierExpr
  | BinaryExpr
  | UnaryExpr;
```

Avoid:

``` ts
any
```

unless there is a strong reason.

## Prefer immutable data where practical

Tokens, AST nodes, and IR instructions should generally be treated as
immutable compiler artifacts.

## Keep modules independent

The lexer should not know about semantic types.

The parser should not perform symbol-table lookup.

The optimizer should not parse source code.

The runtime should execute IR rather than reparse source.

Maintain clean stage boundaries.

------------------------------------------------------------------------

# 24. Compiler Pipeline Contract

Each stage should consume a defined artifact and produce another.

``` text
string
  ↓
Token[]
  ↓
Program AST
  ↓
Semantically validated / annotated AST
  ↓
IRInstruction[]
  ↓
IRInstruction[]
  ↓
ExecutionResult
```

Do not make later stages depend on hidden mutable state from earlier
stages unless the dependency is explicitly part of the architecture,
such as symbol-table access.

------------------------------------------------------------------------

# 25. Testing Strategy

Testing should mirror compiler stages.

## Lexer tests

Test:

-   keywords
-   identifiers
-   numbers
-   strings
-   booleans
-   operators
-   delimiters
-   whitespace
-   invalid characters
-   malformed numbers
-   unterminated strings
-   line/column tracking

## Parser tests

Test:

-   valid workflow
-   declarations
-   when blocks
-   otherwise blocks
-   nested blocks
-   actions
-   alerts
-   logs
-   expression precedence
-   parentheses
-   malformed braces
-   malformed parentheses
-   missing expressions
-   unexpected tokens

## Semantic tests

Test:

-   valid declarations
-   duplicate declarations
-   undefined identifiers
-   valid numeric operations
-   invalid type operations
-   boolean logic
-   compatible equality
-   incompatible equality
-   workflow scope

## IR tests

Test:

-   arithmetic
-   comparisons
-   conditional jumps
-   labels
-   action calls
-   alerts
-   logs
-   multiple conditions

## Optimizer tests

For each optimization, test:

``` text
input IR
→ optimized IR
```

and verify that execution semantics remain unchanged.

## Runtime tests

Test:

-   true branch
-   false branch
-   multiple conditions
-   action dispatch
-   alerts
-   logs
-   runtime errors
-   input values

------------------------------------------------------------------------

# 26. Required Error Test Cases

Maintain explicit malformed examples.

Examples:

### Undefined identifier

``` text
workflow "Test" {
    when temperature > 30 {
        log "Hot"
    }
}
```

when `temperature` was never declared.

### Invalid type

``` text
workflow "Test" {
    input active : boolean

    when active + 5 {
        log "Invalid"
    }
}
```

### Missing brace

``` text
workflow "Test" {
    input temperature : number

    when temperature > 30 {
        alert "Hot"
```

### Invalid token

``` text
workflow "Test" {
    input temperature : number
    @
}
```

The compiler should produce stage-specific diagnostics.

------------------------------------------------------------------------

# 27. Development Workflow

When implementing a feature:

1.  Read the relevant grammar/specification.
2.  Identify which compiler stage owns the behavior.
3.  Implement the smallest change at that stage.
4.  Add focused tests.
5.  Run existing tests.
6.  Verify downstream stages still work.
7.  Update documentation if language behavior changed.

Do not implement a semantic feature inside the lexer or parser merely to
get a test passing.

------------------------------------------------------------------------

# 28. Important Architectural Rules

### Rule 1 --- Do not bypass compiler stages

Do not implement:

``` text
source → runtime
```

when the feature is supposed to demonstrate:

``` text
source → lexer → parser → AST → semantic → IR → optimizer → runtime
```

### Rule 2 --- Do not make TAC cosmetic

The execution engine should actually consume the IR.

### Rule 3 --- Do not make the AST cosmetic

Semantic analysis and IR generation should operate on the AST.

### Rule 4 --- Do not make optimization cosmetic

The optimized IR should be executable and its effect should be
observable through before/after IR.

### Rule 5 --- Preserve source locations

Source locations should flow from tokens into diagnostics and, where
practical, AST/IR artifacts.

### Rule 6 --- Keep the DSL small

Adding general-purpose language features weakens the project's
domain-specific character and increases implementation risk.

### Rule 7 --- Prefer explainability

This project is evaluated as a compiler-design project. Code should be
understandable enough to explain in a viva.

------------------------------------------------------------------------

# 29. What NOT to Do

Do not:

-   replace the compiler with an existing parser framework without a
    project reason
-   use an existing programming language parser to parse CodeFlow
-   interpret CodeFlow directly from source
-   skip AST construction
-   skip semantic analysis
-   generate fake IR only for display
-   hard-code example programs into the compiler
-   hard-code execution results
-   silently accept invalid programs
-   use `any` everywhere
-   introduce a database without a requirement
-   build authentication
-   add cloud infrastructure
-   add external workflow APIs
-   integrate real hardware
-   over-engineer the frontend
-   claim optimization without showing transformed IR
-   claim semantic analysis exists when it has not been implemented
-   claim runtime support before the execution engine is actually
    working

------------------------------------------------------------------------

# 30. Current Implementation Priority

If starting implementation from the current Phase 1 state, work in this
order:

``` text
1. Lexer correctness
2. Token model
3. Recursive-descent parser
4. Complete AST
5. Parser tests
6. Symbol table
7. Type system
8. Semantic analyzer
9. TAC instruction model
10. TAC generator
11. TAC tests
12. Optimizer
13. Optimizer tests
14. Runtime/interpreter
15. End-to-end pipeline
16. Visualization
17. Error UX
18. Comprehensive regression tests
```

Do not jump to visualization polish before compiler correctness.

------------------------------------------------------------------------

# 31. Definition of Done

A feature is complete only when:

-   the language behavior is defined
-   the appropriate compiler stage implements it
-   invalid cases are handled
-   source locations are preserved where relevant
-   unit tests exist
-   existing tests still pass
-   downstream compiler stages continue to work
-   the behavior can be explained in compiler-design terms

For a complete CodeFlow program, "done" means:

``` text
✓ Lexed
✓ Parsed
✓ AST constructed
✓ Semantically validated
✓ Symbol table populated
✓ TAC generated
✓ TAC optimized
✓ Optimized TAC executed
✓ Result/trace produced
✓ Errors reported consistently
✓ Artifacts visible in the UI
```

------------------------------------------------------------------------

# 32. Claude Code Working Style

When modifying the repository:

### First inspect

Before making changes, inspect:

-   repository structure
-   package.json
-   tsconfig.json
-   existing source files
-   existing tests
-   current compiler pipeline
-   README
-   language specification

Do not assume the repository is empty.

### Make focused changes

Prefer small, coherent commits/changes.

Do not rewrite unrelated modules.

### Preserve existing behavior

When adding a compiler stage, ensure existing lexer/parser behavior
remains intact.

### Test after changes

Run the relevant tests after modifying compiler behavior.

For cross-stage changes, run the full test suite.

### Explain compiler decisions

When a design choice matters, document the compiler reason rather than
only the implementation mechanics.

------------------------------------------------------------------------

# 33. When Asked to Add a New Language Feature

Follow this checklist:

``` text
1. Is it inside the approved CodeFlow scope?
2. Does the grammar need to change?
3. Does the lexer need new tokens?
4. Does the AST need a new node?
5. Does semantic analysis need new rules?
6. Does the symbol table need changes?
7. Does TAC need a new instruction or lowering rule?
8. Does optimization need to understand it?
9. Does runtime need to execute it?
10. What invalid programs should be rejected?
11. What tests are required?
12. Does the documentation need updating?
```

Never implement only the parser portion of a language feature and call
the feature complete.

------------------------------------------------------------------------

# 34. When Asked to Debug a Compiler Bug

Trace the artifact pipeline:

``` text
source
→ tokens
→ AST
→ semantic result
→ symbol table
→ TAC
→ optimized TAC
→ runtime
```

Determine the first stage where the artifact becomes incorrect.

Fix the earliest incorrect stage rather than patching later stages to
compensate.

Example:

If the AST is wrong, do not patch the optimizer.

If TAC is wrong, do not add special cases to the runtime to compensate.

------------------------------------------------------------------------

# 35. Design Philosophy

CodeFlow should remain:

**Small enough to finish.**\
**Deep enough to demonstrate compiler design.**\
**Domain-specific enough to be distinctive.**\
**Transparent enough to explain in a viva.**\
**Modular enough to extend.**

The goal is not to build the most powerful language.

The goal is to build a complete, understandable compiler for a
deliberately constrained language and demonstrate the full
transformation from source code to execution.

------------------------------------------------------------------------

# 36. Final Technical Target

The completed system should demonstrate this end-to-end example:

``` text
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

becoming:

``` text
SOURCE
  ↓
TOKENS
  ↓
AST
  ↓
SYMBOL TABLE
  ↓
SEMANTICALLY VALID AST
  ↓
THREE-ADDRESS CODE
  ↓
OPTIMIZED THREE-ADDRESS CODE
  ↓
EXECUTION
  ↓
ALERT / LOG / ACTION TRACE
```

Every transformation should be real, testable, and inspectable.

------------------------------------------------------------------------

# 37. Project Context from the Phase 1 Proposal

The Phase 1 document describes CodeFlow as an individual Compiler Design
Laboratory project at VIT and defines the project as a DSL/compiler for
workflow automation.

The proposal's central distinction is that CodeFlow should be processed
through an explicit compiler pipeline rather than treated as an ad-hoc
configuration evaluator.

The proposal also explicitly states that the project's contribution is
intentionally scoped and should not be presented as novel research or a
production-grade workflow platform.

Maintain that framing throughout development and documentation.
