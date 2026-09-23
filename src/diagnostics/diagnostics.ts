export type CompilerStage = "lexical" | "syntax" | "semantic" | "runtime";

export interface CompilerError {
  stage: CompilerStage;
  message: string;
  line?: number;
  column?: number;
  length?: number;
}

export function formatCompilerError(error: CompilerError): string {
  const stageLabel = error.stage[0]!.toUpperCase() + error.stage.slice(1);
  if (error.line === undefined) {
    return `${stageLabel} error: ${error.message}`;
  }
  const location =
    error.column === undefined
      ? `line ${error.line}`
      : `line ${error.line}, column ${error.column}`;
  return `${stageLabel} error at ${location}:\n${error.message}`;
}

export class DiagnosticBag {
  private readonly errors: CompilerError[] = [];

  report(error: CompilerError): void {
    this.errors.push(error);
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  get all(): readonly CompilerError[] {
    return this.errors;
  }
}
