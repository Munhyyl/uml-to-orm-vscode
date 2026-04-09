import { ClassEntity } from '../../types/schema';
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
  getLineLocation,
  upsertParsedRelation,
} from '../parserUtils';
import { collectPythonClassBlocks } from './pythonParserSupport';

export class SqlAlchemyParserAdapter implements SchemaParserAdapter {
  readonly orm = 'SQLAlchemy' as const;
  readonly parserKind = 'python-cst' as const;

  supportsFile(fileName: string): boolean {
    return fileName.endsWith('.py');
  }

  detect(input: ParserInput): number {
    if (!this.supportsFile(input.fileName)) {
      return 0;
    }
    if (/sqlalchemy/i.test(input.content) || /declarative_base|DeclarativeBase/.test(input.content)) {
      return 1;
    }
    if (/Column\(/.test(input.content) && /relationship\(/.test(input.content)) {
      return 0.85;
    }
    return 0.15;
  }

  async parse(input: ParserInput) {
    const issues = [] as ReturnType<typeof createParserIssue>[];
    const blocks = collectPythonClassBlocks(input.content).filter((block) => /Base/.test(block.bases));
    const entities: ClassEntity[] = [];
    const entitiesByName = new Map<string, ClassEntity>();

    for (const [index, block] of blocks.entries()) {
      const entity = createParsedEntity(block.name, index, input.fileName, getLineLocation(input.content, block.start, block.end, input.fileName));
      entity.tableName = block.body.match(/__tablename__\s*=\s*['"]([^'"]+)['"]/)?.[1];
      entity.attributes = this.extractColumns(block.body, block.bodyStart, input);
      entities.push(entity);
      entitiesByName.set(entity.name, entity);
    }

    const relations = [] as ReturnType<typeof createAssociationRelation>[];
    for (const block of blocks) {
      const entity = entitiesByName.get(block.name);
      if (!entity) {
        continue;
      }
      for (const relation of this.extractRelations(block.body, block.bodyStart, input, entity, entitiesByName)) {
        upsertParsedRelation(relations, relation);
      }
    }

    return {
      entities,
      relations,
      issues,
      database: detectDatabaseFromComment(input.content, getDefaultDatabase(this.orm)),
      confidence: computeParseConfidence(issues, entities, relations),
    };
  }

  private extractColumns(body: string, bodyStart: number, input: ParserInput) {
    const attrs = [] as ReturnType<typeof createParsedAttribute>[];
    let localOffset = 0;
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      const lineStart = bodyStart + localOffset;
      localOffset += line.length + 1;
      const match = trimmed.match(/^(\w+)\s*=\s*Column\((.+)\)$/);
      if (!match) {
        continue;
      }
      const [, name, args] = match;
      if (/ForeignKey\(/.test(args)) {
        continue;
      }
      attrs.push(
        createParsedAttribute(name, this.parseColumnType(args), {
          isPrimary: /primary_key\s*=\s*True/.test(args),
          isNullable: /primary_key\s*=\s*True/.test(args) ? false : /nullable\s*=\s*False/.test(args) ? false : true,
          isUnique: /primary_key\s*=\s*True/.test(args) || /unique\s*=\s*True/.test(args),
          defaultExpression: args.match(/default\s*=\s*([^,)\n]+)/)?.[1]?.trim(),
          defaultValue: args.match(/default\s*=\s*([^,)\n]+)/)?.[1]?.trim(),
          sourceLocation: getLineLocation(input.content, lineStart, lineStart + line.length, input.fileName),
        }),
      );
    }
    return attrs;
  }

  private extractRelations(
    body: string,
    bodyStart: number,
    input: ParserInput,
    currentEntity: ClassEntity,
    entitiesByName: Map<string, ClassEntity>,
  ) {
    const relations = [] as ReturnType<typeof createAssociationRelation>[];
    let localOffset = 0;
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      const lineStart = bodyStart + localOffset;
      localOffset += line.length + 1;
      const match = trimmed.match(/^(\w+)\s*=\s*relationship\(\s*['"](\w+)['"]([^)]*)\)/);
      if (!match) {
        continue;
      }
      const [, fieldName, targetName, options] = match;
      const target = entitiesByName.get(targetName);
      if (!target) {
        continue;
      }
      const location = getLineLocation(input.content, lineStart, lineStart + line.length, input.fileName);
      const backPopulates = options.match(/back_populates\s*=\s*['"]([^'"]+)['"]/)?.[1];

      if (/secondary\s*=/.test(options)) {
        if (currentEntity.name.localeCompare(target.name) <= 0) {
          relations.push(
            createAssociationRelation(currentEntity, target, 'ManyToMany', fieldName, backPopulates, '*', '*', {
              relationOwner: 'source',
              sourceLocation: location,
            }),
          );
        }
      } else if (/uselist\s*=\s*False/.test(options)) {
        relations.push(
          createAssociationRelation(currentEntity, target, 'OneToOne', fieldName, backPopulates, '1', '1', {
            relationOwner: 'source',
            sourceLocation: location,
          }),
        );
      } else if (this.hasUniqueForeignKeyTo(body, target)) {
        relations.push(
          createAssociationRelation(target, currentEntity, 'OneToOne', backPopulates, fieldName, '1', '1', {
            relationOwner: 'source',
            sourceLocation: location,
          }),
        );
      } else if (this.hasForeignKeyTo(body, target)) {
        relations.push(
          createAssociationRelation(target, currentEntity, 'OneToMany', backPopulates, fieldName, '1', '*', {
            relationOwner: 'target',
            sourceLocation: location,
          }),
        );
      } else {
        relations.push(
          createAssociationRelation(currentEntity, target, 'OneToMany', fieldName, undefined, '1', '*', {
            relationOwner: 'target',
            sourceLocation: location,
          }),
        );
      }
    }
    return relations;
  }

  private hasForeignKeyTo(body: string, target: ClassEntity): boolean {
    const tableName = target.tableName || target.name.toLowerCase();
    return new RegExp(`ForeignKey\\(\\s*['"][^'"]*${tableName}\\.`, 'i').test(body);
  }

  private hasUniqueForeignKeyTo(body: string, target: ClassEntity): boolean {
    const tableName = target.tableName || target.name.toLowerCase();
    return new RegExp(`ForeignKey\\(\\s*['"][^'"]*${tableName}\\.[^'"]+['"]\\)\\s*,\\s*unique\\s*=\\s*True`, 'i').test(body);
  }

  private parseColumnType(args: string) {
    if (/LargeBinary/i.test(args)) return 'Bytes';
    if (/JSONB|JSON/i.test(args)) return 'JSON';
    if (/Numeric|Decimal/i.test(args)) return 'Decimal';
    if (/DateTime|Date\b/i.test(args)) return 'DateTime';
    if (/Boolean/i.test(args)) return 'Boolean';
    if (/Float/i.test(args)) return 'Float';
    if (/Integer|BigInteger/i.test(args)) return 'Int';
    return 'String';
  }
}
