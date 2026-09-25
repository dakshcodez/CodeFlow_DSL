import type { IRInstruction, Operand, WorkflowIR } from "./instructions.js";

export function formatOperand(operand: Operand): string {
  switch (operand.kind) {
    case "Temp":
      return `t${operand.id}`;
    case "Var":
      return operand.name;
    case "Const":
      return JSON.stringify(operand.value);
  }
}

export function formatInstruction(instruction: IRInstruction): string {
  switch (instruction.kind) {
    case "Assign":
      return `${formatOperand(instruction.dest)} = ${formatOperand(instruction.value)}`;
    case "Binary":
      return `${formatOperand(instruction.dest)} = ${formatOperand(instruction.left)} ${instruction.operator} ${formatOperand(instruction.right)}`;
    case "Unary":
      return `${formatOperand(instruction.dest)} = ${instruction.operator} ${formatOperand(instruction.operand)}`;
    case "IfFalse":
      return `IF_FALSE ${formatOperand(instruction.condition)} GOTO ${instruction.label}`;
    case "Goto":
      return `GOTO ${instruction.label}`;
    case "Label":
      return `LABEL ${instruction.label}`;
    case "Call":
      return `CALL ${instruction.name}(${instruction.args.map(formatOperand).join(", ")})`;
    case "Alert":
      return `ALERT ${JSON.stringify(instruction.message)}`;
    case "Log":
      return `LOG ${JSON.stringify(instruction.message)}`;
  }
}

export function formatWorkflowIR(workflowIR: WorkflowIR): string {
  const lines = workflowIR.instructions.map((instruction) => {
    const indent = instruction.kind === "Label" ? "" : "    ";
    return `${indent}${formatInstruction(instruction)}`;
  });
  return [`workflow "${workflowIR.workflowName}":`, ...lines].join("\n");
}
