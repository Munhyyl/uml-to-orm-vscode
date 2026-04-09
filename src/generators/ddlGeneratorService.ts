import { getPrimaryAttribute, getPrimaryAttributeName } from '../domain/schema/schemaOperations';
import { normalizeProjectSchema, resolveDatabase } from '../shared/ormCatalog';
import { getAttributeColumnName, getEntityTableName, getRelationJoinTableName, lowerFirst, upperFirst } from '../shared/schemaNaming';
import { ProjectSchema, Relation } from '../types/schema';
import { SchemaValidator } from '../utils/schemaValidator';
import { getDdlDialectProfile } from './ddlDialectProfiles';

export class DdlGeneratorService {
  generate(schema: ProjectSchema): string {
    const normalizedSchema = normalizeProjectSchema(schema);
    const errors = new SchemaValidator().validate(normalizedSchema).filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      throw new Error(errors.map((issue) => issue.message).join('; '));
    }

    const database = resolveDatabase(normalizedSchema.config);
    const dialect = getDdlDialectProfile(database);
    const statements: string[] = [`-- ${database} DDL for ${normalizedSchema.config.projectName || 'schema'}`];
    const dataEntities = normalizedSchema.entities.filter((entity) => !['enum', 'interface'].includes(entity.stereotype || ''));

    for (const entity of dataEntities) {
      const tableName = getEntityTableName(entity);
      const columns: string[] = [];
      const constraints: string[] = [];
      const indexes: string[] = [];

      for (const attribute of entity.attributes) {
        columns.push(this.buildColumnDefinition(attribute, dialect));
        if (attribute.isUnique && !attribute.isPrimary) {
          constraints.push(`UNIQUE (${getAttributeColumnName(attribute)})`);
        }
      }

      for (const relation of normalizedSchema.relations) {
        const relationColumns = this.buildRelationColumns(relation, normalizedSchema, entity.id, dialect);
        columns.push(...relationColumns.columns);
        constraints.push(...relationColumns.constraints);
        indexes.push(...relationColumns.indexes);
      }

      statements.push(`CREATE TABLE ${tableName} (\n  ${[...columns, ...constraints].join(',\n  ')}\n);`);
      statements.push(...indexes);
    }

    for (const relation of normalizedSchema.relations.filter((relation) => relation.type === 'ManyToMany')) {
      const source = normalizedSchema.entities.find((entity) => entity.id === relation.sourceClassId);
      const target = normalizedSchema.entities.find((entity) => entity.id === relation.targetClassId);
      if (!source || !target) {
        continue;
      }
      const sourcePk = getPrimaryAttribute(source);
      const targetPk = getPrimaryAttribute(target);
      if (!sourcePk || !targetPk) {
        continue;
      }
      const joinTableName = getRelationJoinTableName(source, target, relation);
      const sourceColumn = `${lowerFirst(source.name)}${upperFirst(getPrimaryAttributeName(source))}`;
      const targetColumn = `${lowerFirst(target.name)}${upperFirst(getPrimaryAttributeName(target))}`;
      const sourceType = sourcePk.type === 'Int' ? getDdlDialectProfile(resolveDatabase(normalizedSchema.config)).scalarTypes.Int : dialect.defaultStringPrimaryKeyType;
      const targetType = targetPk.type === 'Int' ? getDdlDialectProfile(resolveDatabase(normalizedSchema.config)).scalarTypes.Int : dialect.defaultStringPrimaryKeyType;
      statements.push(
        `CREATE TABLE ${joinTableName} (\n  ${sourceColumn} ${sourceType} NOT NULL,\n  ${targetColumn} ${targetType} NOT NULL,\n  PRIMARY KEY (${sourceColumn}, ${targetColumn}),\n  ${dialect.buildForeignKeyConstraint(`fk_${joinTableName}_${sourceColumn}`, sourceColumn, getEntityTableName(source), getAttributeColumnName(sourcePk))},\n  ${dialect.buildForeignKeyConstraint(`fk_${joinTableName}_${targetColumn}`, targetColumn, getEntityTableName(target), getAttributeColumnName(targetPk))}\n);`,
      );
    }

    return statements.join('\n\n');
  }

  private buildColumnDefinition(attribute: ProjectSchema['entities'][number]['attributes'][number], dialect: ReturnType<typeof getDdlDialectProfile>): string {
    const columnName = getAttributeColumnName(attribute);
    const type = attribute.isPrimary && attribute.type === 'Int'
      ? dialect.autoIncrementPrimaryKey
      : attribute.type === 'String' && attribute.length
        ? `VARCHAR(${attribute.length})`
        : attribute.type === 'Decimal' && attribute.precision && attribute.scale !== undefined
          ? `${dialect.database === 'MySQL' ? 'DECIMAL' : 'NUMERIC'}(${attribute.precision},${attribute.scale})`
          : dialect.scalarTypes[attribute.type];
    const parts = [`${columnName} ${type}`];
    if (!attribute.isNullable || attribute.isPrimary) {
      parts.push('NOT NULL');
    }
    if (attribute.isPrimary) {
      parts.push('PRIMARY KEY');
    }
    const defaultExpression = attribute.defaultExpression || attribute.defaultValue;
    if (defaultExpression) {
      parts.push(`DEFAULT ${defaultExpression}`);
    }
    return parts.join(' ');
  }

  private buildRelationColumns(
    relation: Relation,
    schema: ProjectSchema,
    entityId: string,
    dialect: ReturnType<typeof getDdlDialectProfile>,
  ): { columns: string[]; constraints: string[]; indexes: string[] } {
    const columns: string[] = [];
    const constraints: string[] = [];
    const indexes: string[] = [];
    if (relation.type === 'ManyToMany') {
      return { columns, constraints, indexes };
    }

    const source = schema.entities.find((entity) => entity.id === relation.sourceClassId);
    const target = schema.entities.find((entity) => entity.id === relation.targetClassId);
    if (!source || !target) {
      return { columns, constraints, indexes };
    }

    const sourcePk = getPrimaryAttribute(source);
    const targetPk = getPrimaryAttribute(target);
    if (!sourcePk || !targetPk) {
      return { columns, constraints, indexes };
    }

    if (relation.type === 'OneToMany' && entityId === target.id) {
      const columnName = this.buildForeignKeyColumnName(relation.targetFieldName || lowerFirst(source.name), getPrimaryAttributeName(source));
      columns.push(`${columnName} ${sourcePk.type === 'Int' ? dialect.scalarTypes.Int : dialect.defaultStringPrimaryKeyType}${relation.onDelete === 'SetNull' ? '' : ' NOT NULL'}`);
      constraints.push(
        dialect.buildForeignKeyConstraint(`fk_${getEntityTableName(target)}_${columnName}`, columnName, getEntityTableName(source), getAttributeColumnName(sourcePk), this.toSqlOnDelete(relation.onDelete)),
      );
      indexes.push(`CREATE INDEX idx_${getEntityTableName(target)}_${columnName} ON ${getEntityTableName(target)} (${columnName});`);
    }

    if (relation.type === 'OneToOne') {
      const ownerEntity = relation.relationOwner === 'source' ? source : target;
      const referencedEntity = ownerEntity.id === source.id ? target : source;
      const ownerPk = ownerEntity.id === source.id ? targetPk : sourcePk;
      const fieldName = ownerEntity.id === source.id ? relation.sourceFieldName : relation.targetFieldName;
      if (entityId === ownerEntity.id) {
        const columnName = this.buildForeignKeyColumnName(fieldName || lowerFirst(referencedEntity.name), getPrimaryAttributeName(referencedEntity));
        columns.push(`${columnName} ${ownerPk.type === 'Int' ? dialect.scalarTypes.Int : dialect.defaultStringPrimaryKeyType} NOT NULL`);
        constraints.push(`UNIQUE (${columnName})`);
        constraints.push(
          dialect.buildForeignKeyConstraint(`fk_${getEntityTableName(ownerEntity)}_${columnName}`, columnName, getEntityTableName(referencedEntity), getAttributeColumnName(ownerPk), this.toSqlOnDelete(relation.onDelete)),
        );
      }
    }

    return { columns, constraints, indexes };
  }

  private buildForeignKeyColumnName(fieldName: string, pkName: string): string {
    return pkName === 'id' ? `${fieldName}Id` : `${fieldName}${upperFirst(pkName)}`;
  }

  private toSqlOnDelete(onDelete?: Relation['onDelete']): string | undefined {
    if (!onDelete) {
      return undefined;
    }
    if (onDelete === 'SetNull') return 'SET NULL';
    if (onDelete === 'SetDefault') return 'SET DEFAULT';
    return onDelete.toUpperCase();
  }
}
