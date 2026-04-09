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

export class HibernateParserAdapter implements SchemaParserAdapter {
  readonly orm = 'Hibernate' as const;
  readonly parserKind = 'java-ast' as const;

  supportsFile(fileName: string): boolean {
    return fileName.endsWith('.java');
  }

  detect(input: ParserInput): number {
    if (!this.supportsFile(input.fileName)) {
      return 0;
    }
    if (/@Entity\b/.test(input.content) || /jakarta\.persistence/.test(input.content)) {
      return 1;
    }
    return 0.2;
  }

  async parse(input: ParserInput) {
    const issues = [] as ReturnType<typeof createParserIssue>[];
    try {
      const dynamicImport = new Function('specifier', 'return import(specifier);') as <T>(specifier: string) => Promise<T>;
      const javaParser = await dynamicImport<{ parse: (content: string) => unknown }>('java-parser');
      javaParser.parse(input.content);
    } catch (error) {
      issues.push(
        createParserIssue(
          'warning',
          'JAVA_PARSE_FALLBACK',
          `Java parser reported syntax issues and extraction fell back to annotation scanning: ${String(error)}`,
          true,
        ),
      );
    }

    const enumBlocks = this.extractBlocks(input.content, /(?:public\s+)?enum\s+(\w+)\s*\{/g);
    const classBlocks = this.extractBlocks(input.content, /(?:@Entity|@MappedSuperclass)[\s\S]*?(?:public\s+)?(?:abstract\s+)?class\s+(\w+)\s*[^{]*\{/g);
    const entities: ClassEntity[] = [];
    const entitiesByName = new Map<string, ClassEntity>();

    for (const [index, block] of enumBlocks.entries()) {
      const entity = createParsedEntity(block.name, index, input.fileName, getLineLocation(input.content, block.start, block.end, input.fileName));
      entity.stereotype = 'enum';
      entity.attributes = block.body
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value, memberIndex) =>
          createParsedAttribute(value.replace(/[^\w]/g, ''), 'String', {
            id: `enum_${entity.id}_${memberIndex}`,
            isNullable: false,
            isUnique: true,
          }),
        );
      entities.push(entity);
      entitiesByName.set(entity.name, entity);
    }

    for (const [index, block] of classBlocks.entries()) {
      const entity = createParsedEntity(
        block.name,
        index + enumBlocks.length,
        input.fileName,
        getLineLocation(input.content, block.start, block.end, input.fileName),
      );
      entity.stereotype = /abstract class/.test(block.header) || /@MappedSuperclass/.test(block.header) ? 'abstract' : 'entity';
      entity.tableName = block.header.match(/@Table\s*\(\s*name\s*=\s*"([^"]+)"/)?.[1];
      entity.attributes = this.extractFields(block.body, block.bodyStart, input);
      entities.push(entity);
      entitiesByName.set(entity.name, entity);
    }

    const relations = [] as ReturnType<typeof createAssociationRelation>[];
    for (const block of classBlocks) {
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
    const lines = body.split('\n');
    for (let index = 0, offset = 0; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();
      const lineStart = bodyStart + offset;
      offset += lines[index].length + 1;
      if (!trimmed.startsWith('@')) {
        continue;
      }

      const annotationLines = [trimmed];
      let fieldLine = '';
      let fieldOffset = lineStart;
      let annotationDepth = this.annotationDepthDelta(trimmed);
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const next = lines[cursor].trim();
        if (next.startsWith('@') || annotationDepth > 0) {
          annotationLines.push(next);
          annotationDepth += this.annotationDepthDelta(next);
          continue;
        }
        fieldLine = next;
        fieldOffset = bodyStart + lines.slice(0, cursor).reduce((sum, line) => sum + line.length + 1, 0);
        index = cursor;
        offset = fieldOffset - bodyStart + lines[cursor].length + 1;
        break;
      }

      if (!fieldLine || /@JoinColumn/.test(annotationLines.join(' '))) {
        continue;
      }

      const fieldMatch = fieldLine.match(/(?:private|protected|public)\s+([\w<>[\]]+)\s+(\w+)\s*;/);
      if (!fieldMatch) {
        continue;
      }

      const annotations = annotationLines.join(' ');
      if (!/@Column|@Id/.test(annotations)) {
        continue;
      }

      attrs.push(
        createParsedAttribute(fieldMatch[2], this.parseJavaType(fieldMatch[1], annotations), {
          isPrimary: /@Id\b/.test(annotations),
          isNullable: /nullable\s*=\s*false/.test(annotations) ? false : !/@Id\b/.test(annotations),
          isUnique: /unique\s*=\s*true/.test(annotations) || /@Id\b/.test(annotations),
          columnName: annotations.match(/name\s*=\s*"([^"]+)"/)?.[1],
          length: this.readNumericAnnotationOption(annotations, 'length'),
          precision: this.readNumericAnnotationOption(annotations, 'precision'),
          scale: this.readNumericAnnotationOption(annotations, 'scale'),
          defaultExpression: annotations.match(/default\s+([^"]+)/)?.[1]?.trim(),
          defaultValue: annotations.match(/default\s+([^"]+)/)?.[1]?.trim(),
          sourceLocation: getLineLocation(input.content, fieldOffset, fieldOffset + fieldLine.length, input.fileName),
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
    const lines = body.split('\n');
    for (let index = 0, offset = 0; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();
      const lineStart = bodyStart + offset;
      offset += lines[index].length + 1;
      if (!trimmed.startsWith('@')) {
        continue;
      }

      const annotationLines = [trimmed];
      let fieldLine = '';
      let fieldOffset = lineStart;
      let annotationDepth = this.annotationDepthDelta(trimmed);
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const next = lines[cursor].trim();
        if (next.startsWith('@') || annotationDepth > 0) {
          annotationLines.push(next);
          annotationDepth += this.annotationDepthDelta(next);
          continue;
        }
        fieldLine = next;
        fieldOffset = bodyStart + lines.slice(0, cursor).reduce((sum, line) => sum + line.length + 1, 0);
        index = cursor;
        break;
      }

      const annotations = annotationLines.join(' ');
      const decorator = annotations.match(/@(OneToMany|ManyToOne|OneToOne|ManyToMany)\b/)?.[1];
      if (!decorator || !fieldLine) {
        continue;
      }

      const collectionMatch = fieldLine.match(/(?:private|protected|public)\s+\w+<(\w+)>\s+(\w+)\s*(?:=\s*[^;]+)?;/);
      const scalarMatch = fieldLine.match(/(?:private|protected|public)\s+(\w+)\s+(\w+)\s*(?:=\s*[^;]+)?;/);
      const targetName = collectionMatch?.[1] || scalarMatch?.[1];
      const fieldName = collectionMatch?.[2] || scalarMatch?.[2];
      if (!targetName || !fieldName) {
        continue;
      }

      const target = entitiesByName.get(targetName);
      if (!target) {
        continue;
      }

      const mappedBy = annotations.match(/mappedBy\s*=\s*"([^"]+)"/)?.[1];
      const hasJoinColumn = /@JoinColumn/.test(annotations);
      const hasJoinTable = /@JoinTable/.test(annotations);
      const onDelete = annotations.match(/OnDeleteAction\.(\w+)/)?.[1];
      const location = getLineLocation(input.content, fieldOffset, fieldOffset + fieldLine.length, input.fileName);

      if (decorator === 'OneToMany') {
        relations.push(
          createAssociationRelation(currentEntity, target, 'OneToMany', fieldName, mappedBy, '1', '*', {
            relationOwner: 'target',
            sourceLocation: location,
          }),
        );
      } else if (decorator === 'ManyToOne') {
        relations.push(
          createAssociationRelation(target, currentEntity, 'OneToMany', mappedBy, fieldName, '1', '*', {
            relationOwner: 'target',
            sourceLocation: location,
            onDelete: this.normalizeOnDelete(onDelete),
          }),
        );
      } else if (decorator === 'OneToOne') {
        if (hasJoinColumn || !mappedBy) {
          relations.push(
            createAssociationRelation(currentEntity, target, 'OneToOne', fieldName, mappedBy, '1', '1', {
              relationOwner: 'source',
              sourceLocation: location,
              onDelete: this.normalizeOnDelete(onDelete),
            }),
          );
        } else {
          relations.push(
            createAssociationRelation(target, currentEntity, 'OneToOne', mappedBy, fieldName, '1', '1', {
              relationOwner: 'source',
              sourceLocation: location,
              onDelete: this.normalizeOnDelete(onDelete),
            }),
          );
        }
      } else if (decorator === 'ManyToMany') {
        if (hasJoinTable || !mappedBy) {
          relations.push(
            createAssociationRelation(currentEntity, target, 'ManyToMany', fieldName, mappedBy, '*', '*', {
              relationOwner: 'source',
              sourceLocation: location,
            }),
          );
        } else {
          relations.push(
            createAssociationRelation(target, currentEntity, 'ManyToMany', mappedBy, fieldName, '*', '*', {
              relationOwner: 'source',
              sourceLocation: location,
            }),
          );
        }
      }
    }
    return relations;
  }

  private extractBlocks(content: string, headerRegex: RegExp): Array<{ name: string; header: string; body: string; start: number; end: number; bodyStart: number }> {
    const blocks: Array<{ name: string; header: string; body: string; start: number; end: number; bodyStart: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = headerRegex.exec(content)) !== null) {
      const name = match[1];
      const header = match[0];
      const openBraceIndex = content.indexOf('{', match.index + header.length - 1);
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
        name,
        header,
        body: content.slice(bodyStart, cursor).trim(),
        start: match.index,
        end: cursor + 1,
        bodyStart,
      });
      headerRegex.lastIndex = cursor + 1;
    }
    return blocks;
  }

  private parseJavaType(type: string, annotations: string) {
    if (/SqlTypes\.JSON|jsonb?|longtext json/i.test(annotations)) return 'JSON';
    if (/bytea|blob/i.test(annotations)) return 'Bytes';
    const map: Record<string, 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime' | 'Bytes' | 'Decimal'> = {
      String: 'String',
      Long: 'Int',
      Integer: 'Int',
      int: 'Int',
      long: 'Int',
      Double: 'Float',
      Float: 'Float',
      double: 'Float',
      float: 'Float',
      Boolean: 'Boolean',
      boolean: 'Boolean',
      LocalDateTime: 'DateTime',
      LocalDate: 'DateTime',
      Date: 'DateTime',
      byte: 'Bytes',
      'byte[]': 'Bytes',
      BigDecimal: 'Decimal',
    };
    return map[type] || 'String';
  }

  private readNumericAnnotationOption(annotations: string, option: string): number | undefined {
    const raw = annotations.match(new RegExp(`${option}\\s*=\\s*(\\d+)`))?.[1];
    if (!raw) {
      return undefined;
    }
    return Number(raw);
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

  private annotationDepthDelta(line: string): number {
    return (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
  }
}
