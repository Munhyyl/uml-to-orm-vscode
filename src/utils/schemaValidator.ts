import { ProjectSchema, Relation } from '../types/schema';
import { Issue } from '../types/parsing';
import { getSupportedDatabases, isOrmCompatibleWithLanguage } from '../shared/ormCatalog';
import { getAttributeColumnName, getEntityTableName } from '../shared/schemaNaming';

interface ValidationOptions {
  parseConfidence?: number;
}

/**
 * Validates a schema for consistency and required fields.
 */
export class SchemaValidator {
  validate(schema: ProjectSchema, options: ValidationOptions = {}): Issue[] {
    const issues: Issue[] = [];

    if (!schema.entities || schema.entities.length === 0) {
      issues.push(this.createIssue('warning', 'SCHEMA_EMPTY', 'Schema has no entities', true));
    }

    if (!isOrmCompatibleWithLanguage(schema.config.orm, schema.config.targetLanguage)) {
      issues.push(
        this.createIssue(
          'error',
          'ORM_LANGUAGE_MISMATCH',
          `ORM ${schema.config.orm} is not compatible with language ${schema.config.targetLanguage}`,
          false,
        ),
      );
    }

    if (schema.config.database && !getSupportedDatabases(schema.config.orm).includes(schema.config.database)) {
      issues.push(
        this.createIssue(
          'error',
          'UNSUPPORTED_DATABASE',
          `Database ${schema.config.database} is not supported for ORM ${schema.config.orm}`,
          false,
        ),
      );
    }

    if (typeof options.parseConfidence === 'number') {
      if (options.parseConfidence < 0.35) {
        issues.push(
          this.createIssue(
            'error',
            'PARSE_CONFIDENCE_LOW',
            `Parse confidence is too low (${options.parseConfidence.toFixed(2)}). The imported schema is likely incomplete.`,
            true,
          ),
        );
      } else if (options.parseConfidence < 0.6) {
        issues.push(
          this.createIssue(
            'warning',
            'PARSE_CONFIDENCE_MEDIUM',
            `Parse confidence is moderate (${options.parseConfidence.toFixed(2)}). Review imported entities and relations.`,
            true,
          ),
        );
      }
    }

    const entityNames = new Set<string>();
    const tableNames = new Set<string>();
    for (const entity of schema.entities) {
      if (!entity.name || entity.name.trim() === '') {
        issues.push(this.createIssue('error', 'ENTITY_NAME_MISSING', `Entity ${entity.id} has no name`, false));
      }

      if (entityNames.has(entity.name)) {
        issues.push(
          this.createIssue('error', 'ENTITY_NAME_DUPLICATE', `Duplicate entity name: ${entity.name}`, false, entity.name),
        );
      }
      entityNames.add(entity.name);

      const tableName = getEntityTableName(entity);
      if (tableNames.has(tableName)) {
        issues.push(
          this.createIssue('error', 'TABLE_NAME_DUPLICATE', `Duplicate physical table name: ${tableName}`, false, entity.name),
        );
      }
      tableNames.add(tableName);

      const attrNames = new Set<string>();
      const columnNames = new Set<string>();
      let primaryKeys = 0;

      for (const attr of entity.attributes) {
        if (!attr.name || attr.name.trim() === '') {
          issues.push(
            this.createIssue('error', 'ATTRIBUTE_NAME_MISSING', `Entity ${entity.name} has an attribute with no name`, false, entity.name),
          );
        }

        if (attrNames.has(attr.name)) {
          issues.push(
            this.createIssue(
              'error',
              'ATTRIBUTE_NAME_DUPLICATE',
              `Entity ${entity.name} has duplicate attribute: ${attr.name}`,
              false,
              entity.name,
              attr.name,
            ),
          );
        }
        attrNames.add(attr.name);

        const columnName = getAttributeColumnName(attr);
        if (columnNames.has(columnName)) {
          issues.push(
            this.createIssue(
              'error',
              'COLUMN_NAME_DUPLICATE',
              `Entity ${entity.name} has duplicate physical column name: ${columnName}`,
              false,
              entity.name,
              attr.name,
            ),
          );
        }
        columnNames.add(columnName);

        if (attr.isPrimary) {
          primaryKeys += 1;
        }

        if (attr.defaultValue && attr.defaultExpression) {
          issues.push(
            this.createIssue(
              'error',
              'DEFAULT_CONFLICT',
              `Attribute ${entity.name}.${attr.name} cannot define both defaultValue and defaultExpression`,
              false,
              entity.name,
              attr.name,
            ),
          );
        }

        if (attr.length !== undefined && attr.type !== 'String') {
          issues.push(
            this.createIssue(
              'warning',
              'STRING_LENGTH_ON_NON_STRING',
              `Attribute ${entity.name}.${attr.name} defines length on non-string type ${attr.type}`,
              true,
              entity.name,
              attr.name,
            ),
          );
        }

        if ((attr.precision !== undefined || attr.scale !== undefined) && attr.type !== 'Decimal') {
          issues.push(
            this.createIssue(
              'warning',
              'DECIMAL_METADATA_ON_NON_DECIMAL',
              `Attribute ${entity.name}.${attr.name} defines precision/scale on non-decimal type ${attr.type}`,
              true,
              entity.name,
              attr.name,
            ),
          );
        }

        if (attr.type === 'Bytes' && (attr.defaultValue || attr.defaultExpression)) {
          issues.push(
            this.createIssue(
              'warning',
              'BYTES_DEFAULT_UNSUPPORTED',
              `Attribute ${entity.name}.${attr.name} uses a default that may not map cleanly for binary data`,
              true,
              entity.name,
              attr.name,
            ),
          );
        }
      }

      if (primaryKeys === 0) {
        issues.push(this.createIssue('warning', 'PRIMARY_KEY_MISSING', `Entity ${entity.name} has no primary key`, true, entity.name));
      }

      if (primaryKeys > 1) {
        issues.push(
          this.createIssue(
            'warning',
            'COMPOSITE_PRIMARY_KEY_PARTIAL',
            `Entity ${entity.name} uses multiple primary keys; generator support is partial`,
            true,
            entity.name,
          ),
        );
      }
    }

    for (const relation of schema.relations) {
      const source = schema.entities.find((entity) => entity.id === relation.sourceClassId);
      const target = schema.entities.find((entity) => entity.id === relation.targetClassId);

      if (!source) {
        issues.push(
          this.createIssue('error', 'RELATION_SOURCE_MISSING', `Relation ${relation.id} references non-existent source entity`, false),
        );
      }

      if (!target) {
        issues.push(
          this.createIssue('error', 'RELATION_TARGET_MISSING', `Relation ${relation.id} references non-existent target entity`, false),
        );
      }

      if (!source || !target) {
        continue;
      }

      if (this.isDataRelation(relation) && relation.relationOwner === 'none') {
        issues.push(
          this.createIssue(
            'warning',
            'RELATION_OWNER_AMBIGUOUS',
            `Relation ${source.name} -> ${target.name} does not have a concrete owning side`,
            true,
            source.name,
          ),
        );
      }

      if (relation.onDelete === 'SetNull' && !this.isNullableRelation(relation)) {
        issues.push(
          this.createIssue(
            'warning',
            'ON_DELETE_SET_NULL_NON_NULLABLE',
            `Relation ${source.name} -> ${target.name} uses SetNull without nullable multiplicity hints`,
            true,
            source.name,
          ),
        );
      }
    }

    return issues;
  }

  private createIssue(
    severity: Issue['severity'],
    code: string,
    message: string,
    recoverable: boolean,
    entityName?: string,
    memberName?: string,
  ): Issue {
    return {
      severity,
      code,
      message,
      entityName,
      memberName,
      recoverable,
    };
  }

  private isDataRelation(relation: Relation): boolean {
    return !['inheritance', 'realization', 'dependency'].includes(relation.umlType);
  }

  private isNullableRelation(relation: Relation): boolean {
    return [relation.sourceMultiplicity, relation.targetMultiplicity].some((value) => !!value && /^0/.test(value));
  }
}
