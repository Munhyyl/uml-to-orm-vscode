import { ClassEntity, DatabaseType, Relation } from '../../types/schema';
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

interface PrismaBlock {
  kind: 'datasource' | 'model' | 'enum';
  name: string;
  body: string;
  start: number;
  end: number;
  bodyStart: number;
}

interface PrismaField {
  entity: ClassEntity;
  entityName: string;
  fieldName: string;
  targetName: string;
  relationName?: string;
  isList: boolean;
  isOptional: boolean;
  hasFieldsReference: boolean;
  referencedFieldNames: string[];
  location?: ReturnType<typeof getLineLocation>;
}

export class PrismaParserAdapter implements SchemaParserAdapter {
  readonly orm = 'Prisma' as const;
  readonly parserKind = 'prisma-dsl' as const;

  supportsFile(fileName: string): boolean {
    return fileName.endsWith('.prisma');
  }

  detect(input: ParserInput): number {
    if (this.supportsFile(input.fileName)) {
      return 1;
    }
    if (/datasource\s+\w+\s*\{/.test(input.content) && /model\s+\w+\s*\{/.test(input.content)) {
      return 0.9;
    }
    return 0;
  }

  async parse(input: ParserInput) {
    const issues = [] as ReturnType<typeof createParserIssue>[];
    const blocks = this.scanBlocks(input.content);
    const datasourceBlock = blocks.find((block) => block.kind === 'datasource');
    const database = datasourceBlock
      ? this.parseDatabase(datasourceBlock.body)
      : detectDatabaseFromComment(input.content, getDefaultDatabase(this.orm));

    const modelBlocks = blocks.filter((block) => block.kind === 'model');
    const enumBlocks = blocks.filter((block) => block.kind === 'enum');
    const modelNames = new Set(modelBlocks.map((block) => block.name));
    const entities: ClassEntity[] = [];
    const entitiesByName = new Map<string, ClassEntity>();
    const relationFields: PrismaField[] = [];

    for (const [index, block] of enumBlocks.entries()) {
      const entity = createParsedEntity(block.name, index, input.fileName, getLineLocation(input.content, block.start, block.end, input.fileName));
      entity.stereotype = 'enum';
      entity.attributes = block.body
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'))
        .map((line, idx) =>
          createParsedAttribute(line.split(/\s+/)[0], 'String', {
            id: `enum_${entity.id}_${idx}`,
            isNullable: false,
            isUnique: true,
          }),
        );
      entities.push(entity);
      entitiesByName.set(entity.name, entity);
    }

    for (const [index, block] of modelBlocks.entries()) {
      const entity = createParsedEntity(
        block.name,
        index + enumBlocks.length,
        input.fileName,
        getLineLocation(input.content, block.start, block.end, input.fileName),
      );
      entity.tableName = this.parseBlockTableName(block.body);
      const parsedAttributes: ReturnType<typeof createParsedAttribute>[] = [];

      let localOffset = 0;
      for (const line of block.body.split('\n')) {
        const rawLine = line;
        const trimmed = rawLine.trim();
        const lineStart = block.bodyStart + localOffset;
        localOffset += line.length + 1;
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
          continue;
        }

        const fieldMatch = trimmed.match(/^(\w+)\s+([^\s]+)(.*)$/);
        if (!fieldMatch) {
          issues.push(
            createParserIssue('warning', 'PRISMA_FIELD_UNPARSED', `Could not parse Prisma field line: ${trimmed}`, true, {
              entityName: entity.name,
              location: getLineLocation(input.content, lineStart, lineStart + line.length, input.fileName),
            }),
          );
          continue;
        }

        const [, fieldName, rawType, annotations] = fieldMatch;
        const cleanType = rawType.replace(/\?|\[\]/g, '');
        if (modelNames.has(cleanType)) {
          const relationArgs = this.parseRelationArgs(annotations);
          relationFields.push({
            entity,
            entityName: entity.name,
            fieldName,
            targetName: cleanType,
            relationName: this.parseRelationName(annotations),
            isList: rawType.endsWith('[]'),
            isOptional: rawType.endsWith('?'),
            hasFieldsReference: relationArgs.includes('fields:'),
            referencedFieldNames: this.parseRelationFieldReferences(relationArgs),
            location: getLineLocation(input.content, lineStart, lineStart + line.length, input.fileName),
          });
          continue;
        }

        if (!['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'JSON', 'Bytes', 'Decimal', 'BigInt'].includes(cleanType)) {
          issues.push(
            createParserIssue(
              'warning',
              'PRISMA_TYPE_UNSUPPORTED',
              `Field ${entity.name}.${fieldName} uses unsupported Prisma type ${cleanType}`,
              true,
              {
                entityName: entity.name,
                memberName: fieldName,
                location: getLineLocation(input.content, lineStart, lineStart + line.length, input.fileName),
              },
            ),
          );
        }

        const attr = createParsedAttribute(fieldName, this.mapPrismaType(cleanType), {
          isPrimary: /@id\b/.test(annotations),
          isNullable: rawType.endsWith('?'),
          isUnique: /@unique\b/.test(annotations) || /@id\b/.test(annotations),
          defaultExpression: this.extractAnnotationCall(annotations, '@default') || undefined,
          columnName: this.extractQuotedArgument(this.extractAnnotationCall(annotations, '@map')),
          sourceLocation: getLineLocation(input.content, lineStart, lineStart + line.length, input.fileName),
        });
        attr.defaultValue = attr.defaultExpression;
        parsedAttributes.push(attr);
      }

      const referencedFkNames = new Set(
        relationFields
          .filter((field) => field.entityName === entity.name)
          .flatMap((field) => field.referencedFieldNames),
      );
      entity.attributes = parsedAttributes.filter((attribute) => !referencedFkNames.has(attribute.name));

      entities.push(entity);
      entitiesByName.set(entity.name, entity);
    }

    const relations: Relation[] = [];
    const consumed = new Set<number>();
    relationFields.forEach((field, index) => {
      if (consumed.has(index)) {
        return;
      }
      const targetEntity = entitiesByName.get(field.targetName);
      if (!targetEntity) {
        issues.push(
          createParserIssue(
            'warning',
            'PRISMA_RELATION_TARGET_MISSING',
            `Relation field ${field.entityName}.${field.fieldName} targets missing model ${field.targetName}`,
            true,
            { entityName: field.entityName, memberName: field.fieldName, location: field.location },
          ),
        );
        return;
      }

      const counterpartIndex = relationFields.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          !consumed.has(candidateIndex) &&
          candidate.entityName === field.targetName &&
          candidate.targetName === field.entityName &&
          (field.relationName ? candidate.relationName === field.relationName : true),
      );
      const counterpart = counterpartIndex >= 0 ? relationFields[counterpartIndex] : undefined;

      if (field.isList && counterpart?.isList) {
        const [source, target, sourceFieldName, targetFieldName] =
          field.entity.name.localeCompare(targetEntity.name) <= 0
            ? [field.entity, targetEntity, field.fieldName, counterpart.fieldName]
            : [targetEntity, field.entity, counterpart.fieldName, field.fieldName];
        upsertParsedRelation(
          relations,
          createAssociationRelation(source, target, 'ManyToMany', sourceFieldName, targetFieldName, '*', '*', {
            relationOwner: 'source',
            sourceLocation: field.location,
          }),
        );
        consumed.add(index);
        consumed.add(counterpartIndex);
        return;
      }

      if (field.isList && counterpart && !counterpart.isList) {
        upsertParsedRelation(
          relations,
          createAssociationRelation(field.entity, targetEntity, 'OneToMany', field.fieldName, counterpart.fieldName, '1', '*', {
            relationOwner: 'target',
            sourceLocation: field.location,
          }),
        );
        consumed.add(index);
        consumed.add(counterpartIndex);
        return;
      }

      if (!field.isList && counterpart?.isList) {
        consumed.add(index);
        return;
      }

      if (counterpart && !field.isList && !counterpart.isList) {
        const ownerIsField = field.hasFieldsReference || !counterpart.hasFieldsReference;
        const source = ownerIsField ? targetEntity : field.entity;
        const target = ownerIsField ? field.entity : targetEntity;
        const sourceFieldName = ownerIsField ? counterpart.fieldName : field.fieldName;
        const targetFieldName = ownerIsField ? field.fieldName : counterpart.fieldName;
        upsertParsedRelation(
          relations,
          createAssociationRelation(
            source,
            target,
            'OneToOne',
            sourceFieldName,
            targetFieldName,
            counterpart.isOptional ? '0..1' : '1',
            field.isOptional ? '0..1' : '1',
            { relationOwner: 'source', sourceLocation: field.location },
          ),
        );
        consumed.add(index);
        consumed.add(counterpartIndex);
        return;
      }

      if (field.isList) {
        upsertParsedRelation(
          relations,
          createAssociationRelation(field.entity, targetEntity, 'OneToMany', field.fieldName, undefined, '1', '*', {
            relationOwner: 'target',
            sourceLocation: field.location,
          }),
        );
      } else {
        upsertParsedRelation(
          relations,
          createAssociationRelation(targetEntity, field.entity, 'OneToMany', undefined, field.fieldName, '1', '*', {
            relationOwner: 'target',
            sourceLocation: field.location,
          }),
        );
      }
      issues.push(
        createParserIssue(
          'warning',
          'PRISMA_RELATION_UNPAIRED',
          `Relation field ${field.entityName}.${field.fieldName} could not be paired with an opposite side`,
          true,
          { entityName: field.entityName, memberName: field.fieldName, location: field.location },
        ),
      );
      consumed.add(index);
    });

    return {
      entities,
      relations,
      issues,
      database,
      confidence: computeParseConfidence(issues, entities, relations),
    };
  }

  private scanBlocks(content: string): PrismaBlock[] {
    const blocks: PrismaBlock[] = [];
    const headerRegex = /\b(datasource|model|enum)\s+(\w+)\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = headerRegex.exec(content)) !== null) {
      const kind = match[1] as PrismaBlock['kind'];
      const name = match[2];
      const openBraceIndex = content.indexOf('{', match.index);
      let depth = 0;
      let cursor = openBraceIndex;
      for (; cursor < content.length; cursor += 1) {
        if (content[cursor] === '{') depth += 1;
        if (content[cursor] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const bodyStart = openBraceIndex + 1;
      blocks.push({
        kind,
        name,
        body: content.slice(bodyStart, cursor).trim(),
        start: match.index,
        end: cursor + 1,
        bodyStart,
      });
      headerRegex.lastIndex = cursor + 1;
    }

    return blocks;
  }

  private parseDatabase(body: string): DatabaseType {
    const provider = body.match(/provider\s*=\s*"([^"]+)"/)?.[1]?.toLowerCase();
    if (provider === 'mysql') {
      return 'MySQL';
    }
    return 'PostgreSQL';
  }

  private parseBlockTableName(body: string): string | undefined {
    const blockMap = body.match(/@@map\("([^"]+)"\)/);
    return blockMap?.[1];
  }

  private mapPrismaType(type: string) {
    const mapping: Record<string, 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime' | 'JSON' | 'Bytes' | 'Decimal'> = {
      String: 'String',
      Int: 'Int',
      Float: 'Float',
      Boolean: 'Boolean',
      DateTime: 'DateTime',
      Json: 'JSON',
      JSON: 'JSON',
      Bytes: 'Bytes',
      Decimal: 'Decimal',
      BigInt: 'Int',
    };
    return mapping[type] || 'String';
  }

  private extractAnnotationCall(line: string, marker: string): string | undefined {
    const start = line.indexOf(marker);
    if (start < 0) {
      return undefined;
    }
    const open = line.indexOf('(', start);
    if (open < 0) {
      return undefined;
    }
    let depth = 0;
    for (let index = open; index < line.length; index += 1) {
      if (line[index] === '(') depth += 1;
      if (line[index] === ')') {
        depth -= 1;
        if (depth === 0) {
          return line.slice(open + 1, index).trim();
        }
      }
    }
    return undefined;
  }

  private extractQuotedArgument(value?: string): string | undefined {
    return value?.match(/"([^"]+)"/)?.[1];
  }

  private parseRelationArgs(annotations: string): string {
    return this.extractAnnotationCall(annotations, '@relation') || '';
  }

  private parseRelationName(annotations: string): string | undefined {
    const args = this.parseRelationArgs(annotations);
    const directName = args.match(/^"([^"]+)"/);
    return directName?.[1];
  }

  private parseRelationFieldReferences(args: string): string[] {
    const match = args.match(/fields:\s*\[([^\]]+)\]/);
    if (!match?.[1]) {
      return [];
    }
    return match[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}
