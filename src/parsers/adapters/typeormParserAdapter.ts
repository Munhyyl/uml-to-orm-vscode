import * as ts from 'typescript';
import { ClassEntity, Relation } from '../../types/schema';
import { getDefaultDatabase } from '../../shared/ormCatalog';
import {
  SchemaParserAdapter,
  ParserInput,
  computeParseConfidence,
  createAssociationRelation,
  createParsedAttribute,
  createParsedEntity,
  createParserIssue,
  detectDatabaseFromComment,
  upsertParsedRelation,
} from '../parserUtils';

interface RelationField {
  entity: ClassEntity;
  targetName: string;
  decorator: 'OneToMany' | 'ManyToOne' | 'OneToOne' | 'ManyToMany';
  fieldName: string;
  inverseSide?: string;
  needsJoinColumn: boolean;
  needsJoinTable: boolean;
  onDelete?: string;
  location?: ClassEntity['sourceLocation'];
}

export class TypeOrmParserAdapter implements SchemaParserAdapter {
  readonly orm = 'TypeORM' as const;
  readonly parserKind = 'typescript-ast' as const;

  supportsFile(fileName: string): boolean {
    return fileName.endsWith('.ts') || fileName.endsWith('.js');
  }

  detect(input: ParserInput): number {
    if (!this.supportsFile(input.fileName)) {
      return 0;
    }
    if (/@Entity\b/.test(input.content) || /from ['"]typeorm['"]/.test(input.content)) {
      return 1;
    }
    return 0.2;
  }

  async parse(input: ParserInput) {
    const issues = [] as ReturnType<typeof createParserIssue>[];
    const sourceFile = ts.createSourceFile(
      input.fileName,
      input.content,
      ts.ScriptTarget.Latest,
      true,
      input.fileName.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS,
    );
    const database = detectDatabaseFromComment(input.content, getDefaultDatabase(this.orm));
    const entities: ClassEntity[] = [];
    const entitiesByName = new Map<string, ClassEntity>();
    const relationFields: RelationField[] = [];

    sourceFile.forEachChild((node) => {
      if (ts.isEnumDeclaration(node)) {
        const entity = createParsedEntity(node.name.text, entities.length, input.fileName, this.getLocation(sourceFile, node));
        entity.stereotype = 'enum';
        entity.attributes = node.members.map((member, index) =>
          createParsedAttribute(member.name.getText(sourceFile), 'String', {
            id: `enum_${entity.id}_${index}`,
            isNullable: false,
            isUnique: true,
            sourceLocation: this.getLocation(sourceFile, member),
          }),
        );
        entities.push(entity);
        entitiesByName.set(entity.name, entity);
        return;
      }

      if (ts.isInterfaceDeclaration(node)) {
        const entity = createParsedEntity(node.name.text, entities.length, input.fileName, this.getLocation(sourceFile, node));
        entity.stereotype = 'interface';
        entity.attributes = node.members
          .filter(ts.isPropertySignature)
          .map((member) =>
            createParsedAttribute(member.name.getText(sourceFile), this.mapTsType(member.type?.getText(sourceFile)), {
              isNullable: !!member.questionToken,
              sourceLocation: this.getLocation(sourceFile, member),
            }),
          );
        entities.push(entity);
        entitiesByName.set(entity.name, entity);
        return;
      }

      if (!ts.isClassDeclaration(node) || !node.name) {
        return;
      }

      const decorators = this.getDecorators(node, sourceFile);
      const hasEntityDecorator = decorators.some((decorator) => decorator.name === 'Entity');
      const hasOrmMembers = node.members.some(
        (member) => ts.isPropertyDeclaration(member) && this.getDecorators(member, sourceFile).length > 0,
      );
      if (!hasEntityDecorator && !hasOrmMembers) {
        return;
      }

      const entity = createParsedEntity(node.name.text, entities.length, input.fileName, this.getLocation(sourceFile, node));
      entity.stereotype = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword) ? 'abstract' : 'entity';
      entity.tableName = this.extractEntityTableName(decorators.find((decorator) => decorator.name === 'Entity'));
      entity.attributes = [];

      for (const member of node.members) {
        if (!ts.isPropertyDeclaration(member) || !member.name) {
          continue;
        }

        const propertyName = member.name.getText(sourceFile);
        const propertyDecorators = this.getDecorators(member, sourceFile);
        const propertyType = member.type?.getText(sourceFile) || 'string';
        const location = this.getLocation(sourceFile, member);
        const relationDecorator = propertyDecorators.find((decorator) =>
          ['OneToMany', 'ManyToOne', 'OneToOne', 'ManyToMany'].includes(decorator.name),
        );

        if (relationDecorator) {
          relationFields.push({
            entity,
            targetName: this.extractRelationTarget(relationDecorator.text) || propertyType.replace(/\[\]$/, ''),
            decorator: relationDecorator.name as RelationField['decorator'],
            fieldName: propertyName,
            inverseSide: this.extractInverseSide(relationDecorator.text),
            needsJoinColumn: propertyDecorators.some((decorator) => decorator.name === 'JoinColumn'),
            needsJoinTable: propertyDecorators.some((decorator) => decorator.name === 'JoinTable'),
            onDelete: this.extractOnDelete(relationDecorator.text),
            location,
          });
          continue;
        }

        const primaryDecorator = propertyDecorators.find((decorator) =>
          ['PrimaryGeneratedColumn', 'PrimaryColumn'].includes(decorator.name),
        );
        const columnDecorator = propertyDecorators.find((decorator) => decorator.name === 'Column');
        if (!primaryDecorator && !columnDecorator) {
          continue;
        }

        const columnOptionsText = columnDecorator?.text || primaryDecorator?.text || '';
        const attr = createParsedAttribute(propertyName, this.mapColumnType(propertyType, columnOptionsText), {
          isPrimary: !!primaryDecorator,
          isNullable: primaryDecorator ? false : /nullable\s*:\s*true/.test(columnOptionsText) || !!member.questionToken,
          isUnique: primaryDecorator ? true : /unique\s*:\s*true/.test(columnOptionsText),
          defaultExpression: this.extractObjectProperty(columnOptionsText, 'default'),
          defaultValue: this.extractObjectProperty(columnOptionsText, 'default'),
          columnName: this.extractQuotedObjectProperty(columnOptionsText, 'name'),
          length: this.extractNumericProperty(columnOptionsText, 'length'),
          precision: this.extractNumericProperty(columnOptionsText, 'precision'),
          scale: this.extractNumericProperty(columnOptionsText, 'scale'),
          sourceLocation: location,
        });
        entity.attributes.push(attr);
      }

      entities.push(entity);
      entitiesByName.set(entity.name, entity);
    });

    const relations: Relation[] = [];
    relationFields.forEach((field) => {
      const target = entitiesByName.get(field.targetName);
      if (!target) {
        issues.push(
          createParserIssue(
            'warning',
            'TYPEORM_RELATION_TARGET_MISSING',
            `Relation field ${field.entity.name}.${field.fieldName} targets missing entity ${field.targetName}`,
            true,
            { entityName: field.entity.name, memberName: field.fieldName, location: field.location },
          ),
        );
        return;
      }

      if (field.decorator === 'OneToMany') {
        upsertParsedRelation(
          relations,
          createAssociationRelation(field.entity, target, 'OneToMany', field.fieldName, field.inverseSide, '1', '*', {
            relationOwner: 'target',
            onDelete: this.normalizeOnDelete(field.onDelete),
            sourceLocation: field.location,
          }),
        );
      } else if (field.decorator === 'ManyToOne') {
        upsertParsedRelation(
          relations,
          createAssociationRelation(target, field.entity, 'OneToMany', field.inverseSide, field.fieldName, '1', '*', {
            relationOwner: 'target',
            onDelete: this.normalizeOnDelete(field.onDelete),
            sourceLocation: field.location,
          }),
        );
      } else if (field.decorator === 'OneToOne') {
        if (field.needsJoinColumn) {
          upsertParsedRelation(
            relations,
            createAssociationRelation(field.entity, target, 'OneToOne', field.fieldName, field.inverseSide, '1', '1', {
              relationOwner: 'source',
              onDelete: this.normalizeOnDelete(field.onDelete),
              sourceLocation: field.location,
            }),
          );
        } else {
          upsertParsedRelation(
            relations,
            createAssociationRelation(target, field.entity, 'OneToOne', field.inverseSide, field.fieldName, '1', '1', {
              relationOwner: 'source',
              onDelete: this.normalizeOnDelete(field.onDelete),
              sourceLocation: field.location,
            }),
          );
        }
      } else if (field.decorator === 'ManyToMany') {
        if (field.needsJoinTable) {
          upsertParsedRelation(
            relations,
            createAssociationRelation(field.entity, target, 'ManyToMany', field.fieldName, field.inverseSide, '*', '*', {
              relationOwner: 'source',
              sourceLocation: field.location,
            }),
          );
        } else {
          upsertParsedRelation(
            relations,
            createAssociationRelation(target, field.entity, 'ManyToMany', field.inverseSide, field.fieldName, '*', '*', {
              relationOwner: 'source',
              sourceLocation: field.location,
            }),
          );
        }
      }
    });

    return {
      entities,
      relations,
      issues,
      database,
      confidence: computeParseConfidence(issues, entities, relations),
    };
  }

  private getDecorators(node: ts.Node, sourceFile: ts.SourceFile): Array<{ name: string; text: string }> {
    const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
    return decorators.map((decorator) => {
      const expression = decorator.expression;
      if (ts.isCallExpression(expression)) {
        return { name: expression.expression.getText(sourceFile), text: expression.getText(sourceFile) };
      }
      return { name: expression.getText(sourceFile), text: expression.getText(sourceFile) };
    });
  }

  private getLocation(sourceFile: ts.SourceFile, node: ts.Node) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      fileName: sourceFile.fileName,
      startLine: start.line + 1,
      startColumn: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
    };
  }

  private extractEntityTableName(decorator?: { text: string }): string | undefined {
    if (!decorator) {
      return undefined;
    }
    const stringArg = decorator.text.match(/@Entity\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    if (stringArg) {
      return stringArg[1];
    }
    return this.extractQuotedObjectProperty(decorator.text, 'name');
  }

  private extractRelationTarget(text: string): string | undefined {
    return text.match(/\(\)\s*=>\s*(\w+)/)?.[1];
  }

  private extractInverseSide(text: string): string | undefined {
    return text.match(/=>\s*\w+\.(\w+)/)?.[1];
  }

  private extractOnDelete(text: string): string | undefined {
    return this.extractQuotedObjectProperty(text, 'onDelete') || text.match(/onDelete\s*:\s*(\w+)/)?.[1];
  }

  private extractObjectProperty(text: string, propertyName: string): string | undefined {
    const match = text.match(new RegExp(`${propertyName}\\s*:\\s*([^,}\\n]+)`));
    return match?.[1]?.trim();
  }

  private extractQuotedObjectProperty(text: string, propertyName: string): string | undefined {
    const raw = this.extractObjectProperty(text, propertyName);
    return raw?.replace(/^['"`]/, '').replace(/['"`]$/, '');
  }

  private extractNumericProperty(text: string, propertyName: string): number | undefined {
    const raw = this.extractObjectProperty(text, propertyName);
    if (!raw) {
      return undefined;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  private mapColumnType(typeText: string, decoratorText: string) {
    const explicitType = this.extractQuotedObjectProperty(decoratorText, 'type');
    if (explicitType) {
      if (['json', 'jsonb'].includes(explicitType)) return 'JSON';
      if (['decimal', 'numeric'].includes(explicitType)) return 'Decimal';
      if (['datetime', 'timestamp'].includes(explicitType)) return 'DateTime';
      if (['blob', 'bytea', 'longblob'].includes(explicitType)) return 'Bytes';
      if (['float', 'double', 'double precision'].includes(explicitType)) return 'Float';
      if (['int', 'integer'].includes(explicitType)) return 'Int';
    }
    return this.mapTsType(typeText);
  }

  private mapTsType(typeText?: string) {
    const clean = (typeText || 'string').replace(/\[\]$/, '');
    const mapping: Record<string, 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime' | 'JSON' | 'Bytes' | 'Decimal'> = {
      string: 'String',
      number: 'Int',
      boolean: 'Boolean',
      Date: 'DateTime',
      object: 'JSON',
      Record: 'JSON',
      Buffer: 'Bytes',
    };
    return mapping[clean] || 'String';
  }

  private normalizeOnDelete(value?: string): Relation['onDelete'] | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value.toLowerCase();
    if (normalized === 'cascade') return 'Cascade';
    if (normalized === 'setnull' || normalized === 'set_null') return 'SetNull';
    if (normalized === 'restrict') return 'Restrict';
    if (normalized === 'setdefault' || normalized === 'set_default') return 'SetDefault';
    return undefined;
  }
}
