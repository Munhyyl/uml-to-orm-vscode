import { createAttribute, createEntity } from '../domain/schema/schemaOperations';
import { Attribute, ClassEntity, DataType, DatabaseType, Relation, RelationOwner } from '../types/schema';
import { Issue, ParserKind } from '../types/parsing';
import { getDefaultDatabase } from '../shared/ormCatalog';

export interface ParserInput {
  content: string;
  fileName: string;
}

export interface SchemaParserAdapter {
  orm: 'Prisma' | 'TypeORM' | 'SQLAlchemy' | 'Django' | 'Hibernate';
  parserKind: ParserKind;
  supportsFile(fileName: string): boolean;
  detect(input: ParserInput): number;
  parse(input: ParserInput): Promise<{
    entities: ClassEntity[];
    relations: Relation[];
    issues: Issue[];
    database: DatabaseType;
    confidence: number;
  }>;
}

export function createParserIssue(
  severity: Issue['severity'],
  code: string,
  message: string,
  recoverable: boolean,
  extras: Partial<Issue> = {},
): Issue {
  return {
    severity,
    code,
    message,
    recoverable,
    ...extras,
  };
}

export function createParsedEntity(name: string, index: number, fileName?: string, sourceLocation?: ClassEntity['sourceLocation']): ClassEntity {
  const entity = createEntity(name, { x: (index % 3) * 320, y: Math.floor(index / 3) * 280 });
  entity.id = `entity_${toSlug(name)}_${index}`;
  entity.sourceLocation = sourceLocation ? { ...sourceLocation, fileName: fileName || sourceLocation.fileName } : undefined;
  return entity;
}

export function createParsedAttribute(
  name: string,
  type: DataType,
  extras: Partial<Attribute> = {},
): Attribute {
  return {
    ...createAttribute(name, type, 'private'),
    ...extras,
  };
}

export function createAssociationRelation(
  source: ClassEntity,
  target: ClassEntity,
  type: Relation['type'],
  sourceFieldName?: string,
  targetFieldName?: string,
  sourceMultiplicity?: string,
  targetMultiplicity?: string,
  extras: Partial<Relation> = {},
): Relation {
  return {
    id: createRelationId(source.id, target.id, sourceFieldName || targetFieldName),
    sourceClassId: source.id,
    targetClassId: target.id,
    type,
    umlType: 'association',
    sourceFieldName,
    targetFieldName,
    sourceMultiplicity,
    targetMultiplicity,
    relationOwner: type === 'ManyToMany' ? extras.relationOwner || 'source' : extras.relationOwner || 'source',
    ...extras,
  };
}

export function upsertParsedRelation(relations: Relation[], relation: Relation): void {
  const compatible = relations.find(
    (existing) =>
      existing.sourceClassId === relation.sourceClassId &&
      existing.targetClassId === relation.targetClassId &&
      existing.type === relation.type &&
      existing.umlType === relation.umlType,
  );
  if (compatible) {
    compatible.sourceFieldName = chooseRicherValue(compatible.sourceFieldName, relation.sourceFieldName);
    compatible.targetFieldName = chooseRicherValue(compatible.targetFieldName, relation.targetFieldName);
    compatible.sourceMultiplicity = compatible.sourceMultiplicity || relation.sourceMultiplicity;
    compatible.targetMultiplicity = compatible.targetMultiplicity || relation.targetMultiplicity;
    compatible.relationOwner = compatible.relationOwner === 'none' ? relation.relationOwner : compatible.relationOwner;
    compatible.onDelete = compatible.onDelete || relation.onDelete;
    compatible.joinTableName = compatible.joinTableName || relation.joinTableName;
    return;
  }

  const exact = relations.find(
    (existing) =>
      existing.sourceClassId === relation.sourceClassId &&
      existing.targetClassId === relation.targetClassId &&
      existing.type === relation.type &&
      existing.umlType === relation.umlType &&
      (existing.sourceFieldName || '') === (relation.sourceFieldName || '') &&
      (existing.targetFieldName || '') === (relation.targetFieldName || ''),
  );
  if (exact) {
    return;
  }

  const reversible = relation.type === 'OneToOne' || relation.type === 'ManyToMany';
  if (reversible) {
    const reversed = relations.find(
      (existing) =>
        existing.sourceClassId === relation.targetClassId &&
        existing.targetClassId === relation.sourceClassId &&
        existing.type === relation.type &&
        existing.umlType === relation.umlType,
    );
    if (reversed) {
      reversed.sourceFieldName = chooseRicherValue(reversed.sourceFieldName, relation.targetFieldName);
      reversed.targetFieldName = chooseRicherValue(reversed.targetFieldName, relation.sourceFieldName);
      reversed.sourceMultiplicity = reversed.sourceMultiplicity || relation.targetMultiplicity;
      reversed.targetMultiplicity = reversed.targetMultiplicity || relation.sourceMultiplicity;
      reversed.relationOwner = reversed.relationOwner === 'none' ? relation.relationOwner : reversed.relationOwner;
      reversed.onDelete = reversed.onDelete || relation.onDelete;
      return;
    }
  }

  relations.push(relation);
}

export function computeParseConfidence(issues: Issue[], entities: ClassEntity[], relations: Relation[]): number {
  let score = entities.length > 0 ? 0.7 : 0.25;
  score += Math.min(relations.length * 0.04, 0.12);
  for (const issue of issues) {
    if (issue.severity === 'error') {
      score -= issue.recoverable ? 0.18 : 0.35;
    } else if (issue.severity === 'warning') {
      score -= 0.08;
    } else {
      score -= 0.02;
    }
  }
  return clamp(score, 0, 1);
}

export function detectDatabaseFromComment(content: string, fallback: DatabaseType): DatabaseType {
  const match = content.match(/(?:Target database:\s*|for\s+)(PostgreSQL|MySQL)/i);
  if (!match) {
    return fallback;
  }
  return match[1].toLowerCase() === 'mysql' ? 'MySQL' : 'PostgreSQL';
}

export function getLineLocation(content: string, start: number, end = start, fileName?: string) {
  const startPos = getLineAndColumn(content, start);
  const endPos = getLineAndColumn(content, end);
  return {
    fileName,
    startLine: startPos.line,
    startColumn: startPos.column,
    endLine: endPos.line,
    endColumn: endPos.column,
  };
}

export function inferRelationOwner(type: Relation['type'], preferred: RelationOwner | undefined): RelationOwner {
  if (preferred) {
    return preferred;
  }
  if (type === 'ManyToMany') {
    return 'source';
  }
  return 'source';
}

export function createEmptyParseResultDatabase(orm: SchemaParserAdapter['orm']): DatabaseType {
  return getDefaultDatabase(orm);
}

export function parseIndexGroupOptions(rawOptions: string): { indexGroups?: string[]; uniqueGroups?: string[] } {
  const indexGroups = collectStringList(rawOptions, /indexGroups?\s*:\s*\[([^\]]*)\]/);
  const uniqueGroups = collectStringList(rawOptions, /uniqueGroups?\s*:\s*\[([^\]]*)\]/);
  return {
    indexGroups: indexGroups.length > 0 ? indexGroups : undefined,
    uniqueGroups: uniqueGroups.length > 0 ? uniqueGroups : undefined,
  };
}

export function stripQuotes(value: string): string {
  return value.replace(/^['"`]/, '').replace(/['"`]$/, '');
}

export function toSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'item';
}

export function createRelationId(sourceClassId: string, targetClassId: string, fieldName?: string): string {
  const suffix = fieldName ? `_${toSlug(fieldName)}` : '';
  return `relation_${sourceClassId}_${targetClassId}${suffix}`;
}

function collectStringList(input: string, regex: RegExp): string[] {
  const match = input.match(regex);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split(',')
    .map((part) => stripQuotes(part.trim()))
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function chooseRicherValue(current?: string, incoming?: string): string | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  return incoming.length > current.length ? incoming : current;
}

function getLineAndColumn(content: string, offset: number): { line: number; column: number } {
  const safeOffset = Math.max(0, Math.min(content.length, offset));
  const text = content.slice(0, safeOffset);
  const lines = text.split('\n');
  return {
    line: lines.length,
    column: (lines[lines.length - 1] || '').length + 1,
  };
}
