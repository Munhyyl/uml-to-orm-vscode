import { ClassEntity, DataType, OrmType, ProjectSchema, Relation } from '../../types/schema';
import { buildGeneratedFileName, resolveDatabase } from '../../shared/ormCatalog';
import { getPrimaryAttributeName, getPrimaryAttributeType, isDataRelation } from '../../domain/schema/schemaOperations';

const NON_DATA_ENTITY_STEREOTYPES = new Set(['enum', 'interface', 'abstract']);

export function getRepositoryEntities(schema: ProjectSchema, orm: OrmType): ClassEntity[] {
  return schema.entities.filter((entity) => isRepositoryEligibleEntity(entity, orm));
}

export function isRepositoryEligibleEntity(entity: ClassEntity, _orm: OrmType): boolean {
  return !entity.stereotype || !NON_DATA_ENTITY_STEREOTYPES.has(entity.stereotype);
}

export function getRepositoryModelImportStem(schema: ProjectSchema): string {
  const projectName = schema.config.projectName || 'schema';
  const fileName = buildGeneratedFileName(projectName, schema.config.orm, resolveDatabase(schema.config));
  return fileName.replace(/\.[^.]+$/, '');
}

export function getRepositoryPkName(entity: ClassEntity): string {
  return getPrimaryAttributeName(entity);
}

export function getRepositoryRelationPlaceholders(entity: ClassEntity, schema: ProjectSchema): string[] {
  return schema.relations
    .filter((relation) => isDataRelation(relation.umlType) && (relation.sourceClassId === entity.id || relation.targetClassId === entity.id))
    .map((relation) => resolveRelationPlaceholder(entity, relation, schema))
    .filter((placeholder, index, all) => placeholder.length > 0 && all.indexOf(placeholder) === index);
}

function resolveRelationPlaceholder(entity: ClassEntity, relation: Relation, schema: ProjectSchema): string {
  if (relation.sourceClassId === entity.id) {
    if (relation.sourceFieldName) {
      return relation.sourceFieldName;
    }
    const target = schema.entities.find((candidate) => candidate.id === relation.targetClassId);
    return target ? lowerFirst(target.name) : '';
  }

  if (relation.targetFieldName) {
    return relation.targetFieldName;
  }

  const source = schema.entities.find((candidate) => candidate.id === relation.sourceClassId);
  return source ? lowerFirst(source.name) : '';
}

export function mapDataTypeToTs(type: DataType): string {
  const mapping: Record<DataType, string> = {
    String: 'string',
    Int: 'number',
    Float: 'number',
    Boolean: 'boolean',
    DateTime: 'Date',
    JSON: 'Record<string, unknown>',
    Bytes: 'Buffer',
    Decimal: 'number',
  };
  return mapping[type];
}

export function mapDataTypeToPy(type: DataType): string {
  const mapping: Record<DataType, string> = {
    String: 'str',
    Int: 'int',
    Float: 'float',
    Boolean: 'bool',
    DateTime: 'datetime',
    JSON: 'dict[str, Any]',
    Bytes: 'bytes',
    Decimal: 'Decimal',
  };
  return mapping[type];
}

export function mapDataTypeToJava(type: DataType): string {
  const mapping: Record<DataType, string> = {
    String: 'String',
    Int: 'Integer',
    Float: 'Double',
    Boolean: 'Boolean',
    DateTime: 'LocalDateTime',
    JSON: 'String',
    Bytes: 'byte[]',
    Decimal: 'BigDecimal',
  };
  return mapping[type];
}

export function getRepositoryPkType(entity: ClassEntity, target: 'ts' | 'py' | 'java'): string {
  const type = getPrimaryAttributeType(entity);
  if (target === 'ts') {
    return mapDataTypeToTs(type);
  }
  if (target === 'py') {
    return mapDataTypeToPy(type);
  }
  return mapDataTypeToJava(type);
}

export function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
