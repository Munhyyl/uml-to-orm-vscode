/**
 * Intermediate Representation (IR) for UML Diagrams
 * This is the core data structure that bridges the visual editor and code generators
 */

export type DataType = 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime' | 'JSON' | 'Bytes' | 'Decimal';
export type Visibility = 'public' | 'private' | 'protected' | 'package';
export type RelationOwner = 'source' | 'target' | 'none';

export interface SourceLocation {
  fileName?: string;
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
}

export interface Attribute {
  id: string;
  name: string;
  type: DataType;
  visibility: Visibility;
  isPrimary: boolean;
  isNullable: boolean;
  isUnique: boolean;
  isStatic?: boolean;
  defaultValue?: string;
  defaultExpression?: string;
  documentation?: string;
  columnName?: string;
  length?: number;
  precision?: number;
  scale?: number;
  indexGroups?: string[];
  uniqueGroups?: string[];
  sourceLocation?: SourceLocation;
}

export interface Method {
  id: string;
  name: string;
  returnType: string;
  visibility: Visibility;
  parameters: Array<{ name: string; type: string }>;
  isStatic?: boolean;
  isAbstract?: boolean;
}

export type RelationType = 'OneToOne' | 'OneToMany' | 'ManyToMany';
export type OnDeleteAction = 'Cascade' | 'SetNull' | 'Restrict' | 'SetDefault';
export type UmlRelationType = 'association' | 'aggregation' | 'composition' | 'inheritance' | 'realization' | 'dependency';

/**
 * Derives the ORM RelationType from UML multiplicity strings.
 * - inheritance / realization / dependency → null (not data relations)
 * - multiplicity determines OneToOne / OneToMany / ManyToMany
 */
export function deriveRelationType(
  umlType: UmlRelationType,
  sourceMultiplicity?: string,
  targetMultiplicity?: string,
): RelationType | null {
  if (['inheritance', 'realization', 'dependency'].includes(umlType)) {
    return null; // structural UML relationships — no ORM mapping
  }
  const isMany = (m?: string) => !!m && (m.includes('*') || m.includes('n') || m.includes('..*'));
  const srcMany = isMany(sourceMultiplicity);
  const tgtMany = isMany(targetMultiplicity);
  if (srcMany && tgtMany) return 'ManyToMany';
  if (tgtMany || srcMany) return 'OneToMany';
  return 'OneToOne';
}

export interface Relation {
  id: string;
  sourceClassId: string;
  targetClassId: string;
  /**
   * ORM-level type. For a pure UML workflow this is auto-derived
   * from umlType + multiplicities via deriveRelationType().
   */
  type: RelationType;
  /** Primary UML relationship kind — this is the source of truth. */
  umlType: UmlRelationType;
  sourceMultiplicity?: string; // e.g., "1", "0..*", "1..*"
  targetMultiplicity?: string;
  sourceFieldName?: string;
  targetFieldName?: string;
  onDelete?: OnDeleteAction;
  documentation?: string;
  relationOwner?: RelationOwner;
  joinTableName?: string;
  sourceLocation?: SourceLocation;
}

export interface ClassEntity {
  id: string;
  name: string;
  stereotype?: string; // e.g., "entity", "abstract", "interface", "enum"
  attributes: Attribute[];
  methods?: Method[];
  documentation?: string;
  tableName?: string;
  sourceLocation?: SourceLocation;
  position: { x: number; y: number };
}

export type TargetLanguage = 'TypeScript' | 'Python' | 'Java';
export type OrmType = 'Prisma' | 'TypeORM' | 'SQLAlchemy' | 'Django' | 'Hibernate';
export type DatabaseType = 'PostgreSQL' | 'MySQL';

export interface ProjectConfig {
  targetLanguage: TargetLanguage;
  orm: OrmType;
  database?: DatabaseType;
  outputPath?: string;
  projectName?: string;
  description?: string;
}

export interface ProjectSchema {
  version: '1.0';
  entities: ClassEntity[];
  relations: Relation[];
  config: ProjectConfig;
  createdAt?: string;
  updatedAt?: string;
}
