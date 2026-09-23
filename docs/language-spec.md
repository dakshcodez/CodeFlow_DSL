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

## 12. Phase 1 Scope

This specification covers the full CodeFlow grammar. The Phase 1
prototype implements lexical analysis and recursive-descent parsing over
this grammar, producing a preliminary AST with basic syntax-error
reporting. Semantic analysis (declaration/scope/type checking), TAC
generation, optimization, and execution are scoped for Phases 2 and 3
respectively, per `CLAUDE.md` and the Phase 1 proposal.
