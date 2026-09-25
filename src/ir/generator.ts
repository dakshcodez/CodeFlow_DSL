import type {
  ActionStatement,
  AlertStatement,
  Expr,
  LogStatement,
  OtherwiseStatement,
  Program,
  Statement,
  WhenStatement,
  WorkflowDecl,
} from "../ast/nodes.js";
import type { IRInstruction, Operand, WorkflowIR } from "./instructions.js";

/**
 * Lowers a CodeFlow AST into Three-Address Code, one instruction sequence
 * per workflow (workflows do not call one another, so each is generated
 * independently with its own temporary/label numbering).
 *
 * `otherwise` is only paired with an `if`/`else`-style branch when it
 * directly follows a `when` statement in the same statement list, matching
 * the language's definition of `otherwise` as "a fallback block, executed
 * if the preceding when condition is false." An `otherwise` that does not
 * directly follow a `when` has no condition to fall back on, so its body
 * is generated unconditionally.
 */
class IRGenerator {
  private instructions: IRInstruction[] = [];
  private tempCounter = 0;
  private labelCounter = 0;

  generateWorkflow(workflow: WorkflowDecl): WorkflowIR {
    this.instructions = [];
    this.tempCounter = 0;
    this.labelCounter = 0;
    this.generateStatements(workflow.statements);
    return { workflowName: workflow.name, instructions: this.instructions };
  }

  private newTemp(): Operand {
    this.tempCounter++;
    return { kind: "Temp", id: this.tempCounter };
  }

  private newLabel(): string {
    this.labelCounter++;
    return `L${this.labelCounter}`;
  }

  private emit(instruction: IRInstruction): void {
    this.instructions.push(instruction);
  }

  private generateStatements(statements: readonly Statement[]): void {
    let i = 0;
    while (i < statements.length) {
      const statement = statements[i]!;

      if (statement.kind === "WhenStatement") {
        const next = statements[i + 1];
        if (next?.kind === "OtherwiseStatement") {
          this.generateWhenOtherwise(statement, next);
          i += 2;
          continue;
        }
        this.generateWhen(statement);
        i += 1;
        continue;
      }

      if (statement.kind === "OtherwiseStatement") {
        // Orphaned `otherwise`: no preceding `when` to fall back on here.
        this.generateStatements(statement.body);
        i += 1;
        continue;
      }

      this.generateSimpleStatement(statement);
      i += 1;
    }
  }

  private generateWhen(statement: WhenStatement): void {
    const condition = this.generateExpr(statement.condition);
    const endLabel = this.newLabel();
    this.emit({ kind: "IfFalse", condition, label: endLabel, loc: statement.loc });
    this.generateStatements(statement.body);
    this.emit({ kind: "Label", label: endLabel });
  }

  private generateWhenOtherwise(whenStmt: WhenStatement, otherwiseStmt: OtherwiseStatement): void {
    const condition = this.generateExpr(whenStmt.condition);
    const elseLabel = this.newLabel();
    const endLabel = this.newLabel();

    this.emit({ kind: "IfFalse", condition, label: elseLabel, loc: whenStmt.loc });
    this.generateStatements(whenStmt.body);
    this.emit({ kind: "Goto", label: endLabel });
    this.emit({ kind: "Label", label: elseLabel });
    this.generateStatements(otherwiseStmt.body);
    this.emit({ kind: "Label", label: endLabel });
  }

  private generateSimpleStatement(statement: ActionStatement | AlertStatement | LogStatement): void {
    switch (statement.kind) {
      case "ActionStatement": {
        const args = statement.args.map((arg) => this.generateExpr(arg));
        this.emit({ kind: "Call", name: statement.name, args, loc: statement.loc });
        return;
      }
      case "AlertStatement":
        this.emit({ kind: "Alert", message: statement.message, loc: statement.loc });
        return;
      case "LogStatement":
        this.emit({ kind: "Log", message: statement.message, loc: statement.loc });
        return;
    }
  }

  /** Lowers an expression, always returning a `Temp` operand holding its value. */
  private generateExpr(expr: Expr): Operand {
    switch (expr.kind) {
      case "LiteralExpr": {
        const dest = this.newTemp();
        this.emit({ kind: "Assign", dest, value: { kind: "Const", value: expr.value }, loc: expr.loc });
        return dest;
      }
      case "IdentifierExpr": {
        const dest = this.newTemp();
        this.emit({ kind: "Assign", dest, value: { kind: "Var", name: expr.name }, loc: expr.loc });
        return dest;
      }
      case "UnaryExpr": {
        const operand = this.generateExpr(expr.operand);
        const dest = this.newTemp();
        this.emit({ kind: "Unary", operator: expr.operator, dest, operand, loc: expr.loc });
        return dest;
      }
      case "BinaryExpr": {
        const left = this.generateExpr(expr.left);
        const right = this.generateExpr(expr.right);
        const dest = this.newTemp();
        this.emit({ kind: "Binary", operator: expr.operator, dest, left, right, loc: expr.loc });
        return dest;
      }
    }
  }
}

export function generateIR(program: Program): WorkflowIR[] {
  const generator = new IRGenerator();
  return program.workflows.map((workflow) => generator.generateWorkflow(workflow));
}
