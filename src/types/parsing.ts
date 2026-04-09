import { DatabaseType, OrmType, ProjectSchema, SourceLocation } from './schema';

export type IssueSeverity = 'error' | 'warning' | 'info';
export type ParserKind = 'prisma-dsl' | 'typescript-ast' | 'python-cst' | 'java-ast';

export interface Issue {
  severity: IssueSeverity;
  code: string;
  message: string;
  location?: SourceLocation;
  entityName?: string;
  memberName?: string;
  recoverable: boolean;
}

export interface ParseResult {
  schema: ProjectSchema;
  issues: Issue[];
  parserKind: ParserKind;
  detectedOrm: OrmType;
  detectedDatabase: DatabaseType;
  confidence: number;
}
