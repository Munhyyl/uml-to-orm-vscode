import { Attribute, ClassEntity, Relation } from '../types/schema';

export function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function upperFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getEntityTableName(entity: ClassEntity): string {
  return entity.tableName || toSnakeCase(entity.name);
}

export function getAttributeColumnName(attribute: Attribute): string {
  return attribute.columnName || toSnakeCase(attribute.name);
}

export function getRelationJoinTableName(source: ClassEntity, target: ClassEntity, relation: Relation): string {
  return relation.joinTableName || `${getEntityTableName(source)}_${getEntityTableName(target)}`;
}
