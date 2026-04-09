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

export class DjangoParserAdapter implements SchemaParserAdapter {
  readonly orm = 'Django' as const;
  readonly parserKind = 'python-cst' as const;

  supportsFile(fileName: string): boolean {
    return fileName.endsWith('.py');
  }

  detect(input: ParserInput): number {
    if (!this.supportsFile(input.fileName)) {
      return 0;
    }
    if (/django\.db/.test(input.content) || /models\.Model/.test(input.content)) {
      return 1;
    }
    if (/models\.\w+Field\(/.test(input.content)) {
      return 0.75;
    }
    return 0.1;
  }

  async parse(input: ParserInput) {
    const issues = [] as ReturnType<typeof createParserIssue>[];
    const blocks = collectPythonClassBlocks(input.content).filter((block) => /models\.Model/.test(block.bases));
    const entities: ClassEntity[] = [];
    const entitiesByName = new Map<string, ClassEntity>();

    for (const [index, block] of blocks.entries()) {
      const entity = createParsedEntity(block.name, index, input.fileName, getLineLocation(input.content, block.start, block.end, input.fileName));
      entity.tableName = block.body.match(/db_table\s*=\s*['"]([^'"]+)['"]/)?.[1];
      entity.attributes = this.extractFields(block.body, block.bodyStart, input);
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

  private extractFields(body: string, bodyStart: number, input: ParserInput) {
    const attrs = [] as ReturnType<typeof createParsedAttribute>[];
    let localOffset = 0;
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      const lineStart = bodyStart + localOffset;
      localOffset += line.length + 1;
      const match = trimmed.match(/^(\w+)\s*=\s*models\.(\w+Field)\((.*)\)$/);
      if (!match) {
        continue;
      }
      const [, name, fieldType, args] = match;
      if (['ForeignKey', 'OneToOneField', 'ManyToManyField'].includes(fieldType)) {
        continue;
      }
      attrs.push(
        createParsedAttribute(name, this.parseFieldType(fieldType), {
          isPrimary: /primary_key\s*=\s*True/.test(args),
          isNullable: /null\s*=\s*True/.test(args),
          isUnique: /unique\s*=\s*True/.test(args),
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
      const location = getLineLocation(input.content, lineStart, lineStart + line.length, input.fileName);

      const foreignKeyMatch = trimmed.match(/^(\w+)\s*=\s*models\.ForeignKey\(\s*['"]?(\w+)['"]?(.*)\)$/);
      if (foreignKeyMatch) {
        const [, fieldName, targetName, args] = foreignKeyMatch;
        const target = entitiesByName.get(targetName);
        if (target) {
          relations.push(
            createAssociationRelation(target, currentEntity, 'OneToMany', this.extractRelatedName(args), fieldName, '1', '*', {
              relationOwner: 'target',
              sourceLocation: location,
              onDelete: this.normalizeOnDelete(args.match(/on_delete\s*=\s*models\.(\w+)/)?.[1]),
            }),
          );
        }
        continue;
      }

      const oneToOneMatch = trimmed.match(/^(\w+)\s*=\s*models\.OneToOneField\(\s*['"]?(\w+)['"]?(.*)\)$/);
      if (oneToOneMatch) {
        const [, fieldName, targetName, args] = oneToOneMatch;
        const target = entitiesByName.get(targetName);
        if (target) {
          relations.push(
            createAssociationRelation(currentEntity, target, 'OneToOne', fieldName, this.extractRelatedName(args), '1', '1', {
              relationOwner: 'source',
              sourceLocation: location,
              onDelete: this.normalizeOnDelete(args.match(/on_delete\s*=\s*models\.(\w+)/)?.[1]),
            }),
          );
        }
        continue;
      }

      const manyToManyMatch = trimmed.match(/^(\w+)\s*=\s*models\.ManyToManyField\(\s*['"]?(\w+)['"]?(.*)\)$/);
      if (manyToManyMatch) {
        const [, fieldName, targetName, args] = manyToManyMatch;
        const target = entitiesByName.get(targetName);
      if (target && currentEntity.name.localeCompare(target.name) <= 0) {
          relations.push(
            createAssociationRelation(currentEntity, target, 'ManyToMany', fieldName, this.extractRelatedName(args), '*', '*', {
              relationOwner: 'source',
              sourceLocation: location,
            }),
          );
        }
      }
    }
    return relations;
  }

  private parseFieldType(fieldType: string) {
    const map: Record<string, 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime' | 'JSON' | 'Bytes' | 'Decimal'> = {
      CharField: 'String',
      TextField: 'String',
      SlugField: 'String',
      EmailField: 'String',
      URLField: 'String',
      UUIDField: 'String',
      IntegerField: 'Int',
      BigIntegerField: 'Int',
      FloatField: 'Float',
      BooleanField: 'Boolean',
      DateTimeField: 'DateTime',
      DateField: 'DateTime',
      JSONField: 'JSON',
      BinaryField: 'Bytes',
      DecimalField: 'Decimal',
    };
    return map[fieldType] || 'String';
  }

  private extractRelatedName(args: string): string | undefined {
    return args.match(/related_name\s*=\s*['"]([^'"]+)['"]/)?.[1];
  }

  private normalizeOnDelete(value?: string) {
    if (!value) {
      return undefined;
    }
    if (value === 'CASCADE') return 'Cascade';
    if (value === 'SET_NULL') return 'SetNull';
    if (value === 'RESTRICT') return 'Restrict';
    if (value === 'SET_DEFAULT') return 'SetDefault';
    return undefined;
  }
}
