import type { PrimitiveType, SourceLocation } from "../ast/nodes.js";

export type SymbolKind = "sensor" | "input";

export interface SymbolEntry {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly type: PrimitiveType;
  readonly scope: string;
  readonly loc: SourceLocation;
}

export interface SymbolDeclaration {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly type: PrimitiveType;
  readonly loc: SourceLocation;
}

/**
 * Records the sensors/inputs declared in a single workflow. A workflow is
 * the scope boundary in CodeFlow: declarations do not nest inside
 * when/otherwise blocks, so one flat table per workflow is sufficient to
 * model scope resolution correctly.
 */
export class SymbolTable {
  readonly scope: string;
  private readonly entries = new Map<string, SymbolEntry>();

  constructor(scope: string) {
    this.scope = scope;
  }

  /**
   * Inserts a new symbol into this scope. Returns `false` without
   * modifying the table if `declaration.name` is already declared here.
   */
  insert(declaration: SymbolDeclaration): boolean {
    if (this.entries.has(declaration.name)) return false;
    this.entries.set(declaration.name, { ...declaration, scope: this.scope });
    return true;
  }

  lookup(name: string): SymbolEntry | undefined {
    return this.entries.get(name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  get symbols(): readonly SymbolEntry[] {
    return [...this.entries.values()];
  }
}
