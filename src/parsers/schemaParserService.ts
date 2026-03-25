import * as vscode from 'vscode';
import { ProjectSchema, Relation, ClassEntity, OrmType, TargetLanguage } from '../types/schema';
import { createEntity, createAttribute } from '../domain/schema/schemaOperations';

interface ParsedClassDefinition {
  name: string;
  body: string;
}

export class SchemaParserService {
  async parseFile(uri: vscode.Uri): Promise<ProjectSchema> {
    const fileData = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(fileData);
    const fileName = uri.fsPath.split('/').pop() || '';

    if (fileName.endsWith('.prisma')) {
      return this.parsePrismaSchema(content);
    } else if (fileName.endsWith('.py')) {
      return this.parsePythonSchema(content);
    } else if (fileName.endsWith('.ts') || fileName.endsWith('.js')) {
      return this.parseTypeScriptSchema(content);
    } else if (fileName.endsWith('.java')) {
      return this.parseJavaSchema(content);
    }

    throw new Error(`Unsupported file type: ${fileName}`);
  }

  private buildSchema(
    targetLanguage: TargetLanguage,
    orm: OrmType,
    entities: ClassEntity[],
    relations: Relation[],
  ): ProjectSchema {
    return {
      version: '1.0',
      entities,
      relations,
      config: { targetLanguage, orm },
    };
  }

  private createParsedEntity(name: string, index: number): ClassEntity {
    const entity = createEntity(name, { x: (index % 3) * 320, y: Math.floor(index / 3) * 280 });
    entity.id = `entity_${this.toSlug(name)}_${index}`;
    return entity;
  }

  private upsertParsedRelation(relations: Relation[], relation: Relation): void {
    const exact = relations.find(
      (existing) =>
        existing.sourceClassId === relation.sourceClassId &&
        existing.targetClassId === relation.targetClassId &&
        existing.type === relation.type &&
        existing.umlType === relation.umlType,
    );
    if (exact) {
      exact.sourceFieldName = exact.sourceFieldName || relation.sourceFieldName;
      exact.targetFieldName = exact.targetFieldName || relation.targetFieldName;
      exact.sourceMultiplicity = exact.sourceMultiplicity || relation.sourceMultiplicity;
      exact.targetMultiplicity = exact.targetMultiplicity || relation.targetMultiplicity;
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
        reversed.sourceFieldName = reversed.sourceFieldName || relation.targetFieldName;
        reversed.targetFieldName = reversed.targetFieldName || relation.sourceFieldName;
        reversed.sourceMultiplicity = reversed.sourceMultiplicity || relation.targetMultiplicity;
        reversed.targetMultiplicity = reversed.targetMultiplicity || relation.sourceMultiplicity;
        return;
      }
    }

    relations.push(relation);
  }

  private createRelationId(sourceClassId: string, targetClassId: string, fieldName?: string): string {
    const suffix = fieldName ? `_${this.toSlug(fieldName)}` : '';
    return `relation_${sourceClassId}_${targetClassId}${suffix}`;
  }

  private createAssociationRelation(
    source: ClassEntity,
    target: ClassEntity,
    type: Relation['type'],
    sourceFieldName?: string,
    targetFieldName?: string,
    sourceMultiplicity?: string,
    targetMultiplicity?: string,
  ): Relation {
    return {
      id: this.createRelationId(source.id, target.id, sourceFieldName || targetFieldName),
      sourceClassId: source.id,
      targetClassId: target.id,
      type,
      umlType: 'association',
      sourceFieldName,
      targetFieldName,
      sourceMultiplicity,
      targetMultiplicity,
    };
  }

  private toSlug(value: string): string {
    return value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'item';
  }

  private camelToSnake(value: string): string {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
      .toLowerCase();
  }

  private extractRelatedName(args: string): string | undefined {
    return args.match(/related_name\s*=\s*['"]([^'"]+)['"]/)?.[1];
  }

  // ─── Prisma Parser ──────────────────────────────────────────────

  private parsePrismaSchema(content: string): ProjectSchema {
    const models = this.extractPrismaModels(content);
    const modelNames = models.map((model) => model.name);
    const entities = models.map((model, idx) => {
      const entity = this.createParsedEntity(model.name, idx);
      entity.attributes = model.fields
        .filter((field) => !modelNames.includes(field.rawType.replace('[]', '').replace('?', '')))
        .map((field) => {
          const attr = createAttribute(field.name, this.parsePrismaType(field.rawType) as any, 'private');
          attr.isPrimary = field.hasId;
          attr.isNullable = field.isOptional;
          attr.isUnique = field.hasUnique;
          return attr;
        });
      return entity;
    });
    const entitiesByName = new Map(entities.map((entity) => [entity.name, entity]));

    const relations: Relation[] = [];
    for (const model of models) {
      const currentEntity = entitiesByName.get(model.name);
      if (!currentEntity) continue;

      for (const field of model.fields) {
        const cleanType = field.rawType.replace('[]', '').replace('?', '');
        const targetEntity = entitiesByName.get(cleanType);
        if (!targetEntity) continue;

        const reverseField = models
          .find((candidate) => candidate.name === cleanType)
          ?.fields.find((candidateField) => candidateField.rawType.replace('[]', '').replace('?', '') === model.name);

        const isArray = field.rawType.includes('[]');
        let relation: Relation;

        if (isArray && reverseField?.rawType.includes('[]')) {
          if (currentEntity.id <= targetEntity.id) {
            relation = this.createAssociationRelation(
              currentEntity,
              targetEntity,
              'ManyToMany',
              field.name,
              reverseField?.name,
              '*',
              '*',
            );
          } else {
            relation = this.createAssociationRelation(
              targetEntity,
              currentEntity,
              'ManyToMany',
              reverseField?.name,
              field.name,
              '*',
              '*',
            );
          }
        } else if (!isArray && reverseField && !reverseField.rawType.includes('[]')) {
          relation = this.createAssociationRelation(
            currentEntity,
            targetEntity,
            'OneToOne',
            field.name,
            reverseField.name,
            field.isOptional ? '0..1' : '1',
            reverseField.isOptional ? '0..1' : '1',
          );
        } else if (isArray) {
          relation = this.createAssociationRelation(
            currentEntity,
            targetEntity,
            'OneToMany',
            field.name,
            reverseField?.name,
            '1',
            '*',
          );
        } else {
          relation = this.createAssociationRelation(
            targetEntity,
            currentEntity,
            'OneToMany',
            reverseField?.name,
            field.name,
            '1',
            '*',
          );
        }

        this.upsertParsedRelation(relations, relation);
      }
    }

    return this.buildSchema('TypeScript', 'Prisma', entities, relations);
  }

  private extractPrismaModels(
    content: string,
  ): Array<{
    name: string;
    fields: Array<{ name: string; rawType: string; hasId: boolean; isOptional: boolean; hasUnique: boolean }>;
  }> {
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
    const models: Array<{
      name: string;
      fields: Array<{ name: string; rawType: string; hasId: boolean; isOptional: boolean; hasUnique: boolean }>;
    }> = [];
    let match: RegExpExecArray | null;

    while ((match = modelRegex.exec(content)) !== null) {
      const modelName = match[1];
      const modelBody = match[2];
      models.push({ name: modelName, fields: this.extractPrismaFields(modelBody) });
    }

    return models;
  }

  private extractPrismaFields(
    content: string,
  ): Array<{ name: string; rawType: string; hasId: boolean; isOptional: boolean; hasUnique: boolean }> {
    const lines = content.split('\n');
    const fields: Array<{ name: string; rawType: string; hasId: boolean; isOptional: boolean; hasUnique: boolean }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)/);
      if (!fieldMatch) continue;

      const rawType = fieldMatch[2];
      fields.push({
        name: fieldMatch[1],
        rawType,
        hasId: /@id\b/.test(trimmed),
        hasUnique: /@unique\b/.test(trimmed),
        isOptional: rawType.endsWith('?'),
      });
    }

    return fields;
  }

  private parsePrismaType(type: string): string {
    const clean = type.replace('?', '').replace('[]', '');
    const mapping: Record<string, string> = {
      String: 'String',
      Int: 'Int',
      Float: 'Float',
      Boolean: 'Boolean',
      DateTime: 'DateTime',
      Json: 'JSON',
      Bytes: 'Bytes',
      Decimal: 'Decimal',
      BigInt: 'Int',
    };
    return mapping[clean] || 'String';
  }

  // ─── Python Parser (SQLAlchemy / Django) ─────────────────────────

  private parsePythonSchema(content: string): ProjectSchema {
    const isDjango = content.includes('django.db') || content.includes('models.Model');
    const isSQLAlchemy = content.includes('sqlalchemy') || content.includes('declarative_base') || content.includes('DeclarativeBase');

    if (isDjango) return this.parseDjangoSchema(content);
    if (isSQLAlchemy) return this.parseSQLAlchemySchema(content);
    return this.parseSQLAlchemySchema(content);
  }

  private parseSQLAlchemySchema(content: string): ProjectSchema {
    const definitions = this.extractPythonClassDefinitions(content, /class\s+(\w+)\s*\([^)]*Base[^)]*\)\s*:/g);
    const entities = definitions.map((definition, idx) => {
      const entity = this.createParsedEntity(definition.name, idx);
      entity.attributes = this.extractSQLAlchemyColumns(definition.body);
      return entity;
    });
    const entityByName = new Map(entities.map((entity) => [entity.name, entity]));
    const relations: Relation[] = [];

    for (const definition of definitions) {
      const entity = entityByName.get(definition.name);
      if (!entity) continue;
      for (const relation of this.extractSQLAlchemyRelations(definition.body, entity, entityByName)) {
        this.upsertParsedRelation(relations, relation);
      }
    }

    return this.buildSchema('Python', 'SQLAlchemy', entities, relations);
  }

  private parseDjangoSchema(content: string): ProjectSchema {
    const definitions = this.extractPythonClassDefinitions(content, /class\s+(\w+)\s*\(\s*models\.Model\s*\)\s*:/g);
    const entities = definitions.map((definition, idx) => {
      const entity = this.createParsedEntity(definition.name, idx);
      entity.attributes = this.extractDjangoFields(definition.body);
      return entity;
    });
    const entityByName = new Map(entities.map((entity) => [entity.name, entity]));
    const relations: Relation[] = [];

    for (const definition of definitions) {
      const entity = entityByName.get(definition.name);
      if (!entity) continue;
      for (const relation of this.extractDjangoRelations(definition.body, entity, entityByName)) {
        this.upsertParsedRelation(relations, relation);
      }
    }

    return this.buildSchema('Python', 'Django', entities, relations);
  }

  private extractPythonClassDefinitions(content: string, classRegex: RegExp): ParsedClassDefinition[] {
    const definitions: ParsedClassDefinition[] = [];
    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const classStart = match.index + match[0].length;
      definitions.push({ name: className, body: this.extractPythonClassBody(content, classStart) });
    }

    return definitions;
  }

  private extractPythonClassBody(content: string, startPos: number): string {
    const lines = content.substring(startPos).split('\n');
    const body: string[] = [];
    let started = false;

    for (const line of lines) {
      if (!started && line.trim() === '') continue;
      started = true;
      if (started && line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('\t')) break;
      body.push(line);
    }

    return body.join('\n');
  }

  private extractSQLAlchemyColumns(body: string): Array<any> {
    const colRegex = /(\w+)\s*=\s*Column\(([^)]+)\)/g;
    const attrs: Array<any> = [];
    let match: RegExpExecArray | null;

    while ((match = colRegex.exec(body)) !== null) {
      const attr = createAttribute(match[1], this.parseSAColumnType(match[2]) as any, 'private');
      attr.isPrimary = /primary_key\s*=\s*True/.test(match[2]);
      attr.isNullable = /nullable\s*=\s*False/.test(match[2]) ? false : true;
      attr.isUnique = /unique\s*=\s*True/.test(match[2]);
      attrs.push(attr);
    }

    return attrs;
  }

  private extractSQLAlchemyRelations(
    body: string,
    currentEntity: ClassEntity,
    entitiesByName: Map<string, ClassEntity>,
  ): Relation[] {
    const relationRegex = /(\w+)\s*=\s*relationship\(\s*['"](\w+)['"]([^)]*)\)/g;
    const relations: Relation[] = [];
    let match: RegExpExecArray | null;

    while ((match = relationRegex.exec(body)) !== null) {
      const fieldName = match[1];
      const targetName = match[2];
      const options = match[3];
      const targetEntity = entitiesByName.get(targetName);
      if (!targetEntity) continue;

      if (/secondary\s*=/.test(options)) {
        if (currentEntity.id <= targetEntity.id) {
          relations.push(this.createAssociationRelation(currentEntity, targetEntity, 'ManyToMany', fieldName, undefined, '*', '*'));
        } else {
          relations.push(this.createAssociationRelation(targetEntity, currentEntity, 'ManyToMany', undefined, fieldName, '*', '*'));
        }
      } else if (/uselist\s*=\s*False/.test(options)) {
        relations.push(this.createAssociationRelation(currentEntity, targetEntity, 'OneToOne', fieldName, undefined, '1', '1'));
      } else if (this.hasForeignKeyTo(body, targetName)) {
        relations.push(this.createAssociationRelation(targetEntity, currentEntity, 'OneToMany', undefined, fieldName, '1', '*'));
      } else {
        relations.push(this.createAssociationRelation(currentEntity, targetEntity, 'OneToMany', fieldName, undefined, '1', '*'));
      }
    }

    return relations;
  }

  private hasForeignKeyTo(body: string, targetName: string): boolean {
    const tableName = this.camelToSnake(targetName);
    return new RegExp(`ForeignKey\\(\\s*['"][^'"]*${tableName}\\.`, 'i').test(body);
  }

  private parseSAColumnType(args: string): string {
    if (/Integer/i.test(args)) return 'Int';
    if (/Float/i.test(args)) return 'Float';
    if (/Boolean/i.test(args)) return 'Boolean';
    if (/DateTime/i.test(args)) return 'DateTime';
    if (/JSON/i.test(args)) return 'JSON';
    if (/Numeric|Decimal/i.test(args)) return 'Decimal';
    if (/LargeBinary/i.test(args)) return 'Bytes';
    return 'String';
  }

  private extractDjangoFields(body: string): Array<any> {
    const fieldRegex = /(\w+)\s*=\s*models\.(\w+Field)\(([^)]*)\)/g;
    const attrs: Array<any> = [];
    let match: RegExpExecArray | null;

    while ((match = fieldRegex.exec(body)) !== null) {
      const attr = createAttribute(match[1], this.parseDjangoFieldType(match[2]) as any, 'private');
      attr.isPrimary = /primary_key\s*=\s*True/.test(match[3]);
      attr.isNullable = /null\s*=\s*True/.test(match[3]);
      attr.isUnique = /unique\s*=\s*True/.test(match[3]);
      attrs.push(attr);
    }

    return attrs;
  }

  private extractDjangoRelations(
    body: string,
    currentEntity: ClassEntity,
    entitiesByName: Map<string, ClassEntity>,
  ): Relation[] {
    const relationPatterns: Array<{
      regex: RegExp;
      build: (fieldName: string, targetName: string, args: string) => Relation | null;
    }> = [
      {
        regex: /(\w+)\s*=\s*models\.ForeignKey\(\s*['"]?(\w+)['"]?([^)]*)\)/g,
        build: (fieldName, targetName, args) => {
          const targetEntity = entitiesByName.get(targetName);
          if (!targetEntity) return null;
          return this.createAssociationRelation(
            targetEntity,
            currentEntity,
            'OneToMany',
            this.extractRelatedName(args),
            fieldName,
            '1',
            '*',
          );
        },
      },
      {
        regex: /(\w+)\s*=\s*models\.OneToOneField\(\s*['"]?(\w+)['"]?([^)]*)\)/g,
        build: (fieldName, targetName, args) => {
          const targetEntity = entitiesByName.get(targetName);
          if (!targetEntity) return null;
          return this.createAssociationRelation(
            currentEntity,
            targetEntity,
            'OneToOne',
            fieldName,
            this.extractRelatedName(args),
            '1',
            '1',
          );
        },
      },
      {
        regex: /(\w+)\s*=\s*models\.ManyToManyField\(\s*['"]?(\w+)['"]?([^)]*)\)/g,
        build: (fieldName, targetName, args) => {
          const targetEntity = entitiesByName.get(targetName);
          if (!targetEntity) return null;
          return this.createAssociationRelation(
            currentEntity,
            targetEntity,
            'ManyToMany',
            fieldName,
            this.extractRelatedName(args),
            '*',
            '*',
          );
        },
      },
    ];

    const relations: Relation[] = [];
    for (const pattern of relationPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(body)) !== null) {
        const relation = pattern.build(match[1], match[2], match[3]);
        if (relation) relations.push(relation);
      }
    }

    return relations;
  }

  private parseDjangoFieldType(fieldType: string): string {
    const map: Record<string, string> = {
      CharField: 'String',
      TextField: 'String',
      IntegerField: 'Int',
      BigIntegerField: 'Int',
      FloatField: 'Float',
      BooleanField: 'Boolean',
      DateTimeField: 'DateTime',
      DateField: 'DateTime',
      JSONField: 'JSON',
      BinaryField: 'Bytes',
      DecimalField: 'Decimal',
      SlugField: 'String',
      EmailField: 'String',
      URLField: 'String',
      UUIDField: 'String',
    };
    return map[fieldType] || 'String';
  }

  // ─── TypeScript Parser (TypeORM) ────────────────────────────────

  private parseTypeScriptSchema(content: string): ProjectSchema {
    const classRegex = /@Entity(?:\([^)]*\))?[\s\S]*?export\s+(?:abstract\s+)?class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    const definitions: ParsedClassDefinition[] = [];
    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(content)) !== null) {
      definitions.push({ name: match[1], body: match[2] });
    }

    const entities = definitions.map((definition, idx) => {
      const entity = this.createParsedEntity(definition.name, idx);
      entity.attributes = this.extractTypeORMColumns(definition.body);
      return entity;
    });
    const entityByName = new Map(entities.map((entity) => [entity.name, entity]));
    const relations: Relation[] = [];

    for (const definition of definitions) {
      const entity = entityByName.get(definition.name);
      if (!entity) continue;
      for (const relation of this.extractTypeORMRelations(definition.body, entity, entityByName)) {
        this.upsertParsedRelation(relations, relation);
      }
    }

    return this.buildSchema('TypeScript', 'TypeORM', entities, relations);
  }

  private extractTypeORMColumns(body: string): Array<any> {
    const attrs: Array<any> = [];
    const lines = body.split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      const isPK = /@PrimaryGeneratedColumn|@PrimaryColumn/.test(line);
      const isCol = /@Column/.test(line);
      if (!isPK && !isCol) continue;

      const isNullable = /nullable\s*:\s*true/.test(line);
      const isUnique = /unique\s*:\s*true/.test(line);
      let fieldLine = '';
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].trim();
        if (next.startsWith('@')) continue;
        fieldLine = next;
        break;
      }

      const fieldMatch = fieldLine.match(/(\w+)[!?]?\s*:\s*(\w+)/);
      if (!fieldMatch) continue;

      const attr = createAttribute(fieldMatch[1], this.parseTSType(fieldMatch[2]) as any, 'private');
      attr.isPrimary = isPK;
      attr.isNullable = isPK ? false : isNullable;
      attr.isUnique = isPK ? true : isUnique;
      attrs.push(attr);
    }

    return attrs;
  }

  private extractTypeORMRelations(
    body: string,
    currentEntity: ClassEntity,
    entitiesByName: Map<string, ClassEntity>,
  ): Relation[] {
    const lines = body.split('\n');
    const relations: Relation[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      const decoratorMatch = line.match(/@(OneToMany|ManyToOne|OneToOne|ManyToMany)\(\s*\(\)\s*=>\s*(\w+)/);
      if (!decoratorMatch) continue;

      const decorator = decoratorMatch[1];
      const targetName = decoratorMatch[2];
      const targetEntity = entitiesByName.get(targetName);
      if (!targetEntity) continue;

      const decorators = [line];
      let fieldLine = '';
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].trim();
        if (next.startsWith('@')) {
          decorators.push(next);
          continue;
        }
        fieldLine = next;
        break;
      }

      const fieldMatch = fieldLine.match(/(\w+)[!?]?\s*:\s*([\w[\]]+)/);
      const fieldName = fieldMatch?.[1] || this.toSlug(targetName);
      const inverseField = line.match(/=>\s*\w+\.(\w+)/)?.[1];
      const hasJoinColumn = decorators.some((entry) => /@JoinColumn/.test(entry));
      const hasJoinTable = decorators.some((entry) => /@JoinTable/.test(entry));

      if (decorator === 'OneToMany') {
        relations.push(this.createAssociationRelation(currentEntity, targetEntity, 'OneToMany', fieldName, inverseField, '1', '*'));
      } else if (decorator === 'ManyToOne') {
        relations.push(this.createAssociationRelation(targetEntity, currentEntity, 'OneToMany', inverseField, fieldName, '1', '*'));
      } else if (decorator === 'OneToOne') {
        if (hasJoinColumn) {
          relations.push(this.createAssociationRelation(currentEntity, targetEntity, 'OneToOne', fieldName, inverseField, '1', '1'));
        } else {
          relations.push(this.createAssociationRelation(targetEntity, currentEntity, 'OneToOne', inverseField, fieldName, '1', '1'));
        }
      } else if (decorator === 'ManyToMany') {
        if (hasJoinTable) {
          relations.push(this.createAssociationRelation(currentEntity, targetEntity, 'ManyToMany', fieldName, inverseField, '*', '*'));
        } else {
          relations.push(this.createAssociationRelation(targetEntity, currentEntity, 'ManyToMany', inverseField, fieldName, '*', '*'));
        }
      }
    }

    return relations;
  }

  private parseTSType(tsType: string): string {
    const map: Record<string, string> = {
      string: 'String',
      number: 'Int',
      boolean: 'Boolean',
      Date: 'DateTime',
      object: 'JSON',
      Buffer: 'Bytes',
    };
    return map[tsType] || 'String';
  }

  // ─── Java Parser (Hibernate/JPA) ────────────────────────────────

  private parseJavaSchema(content: string): ProjectSchema {
    const classRegex = /@Entity[\s\S]*?(?:public\s+)?class\s+(\w+)\s*(?:extends\s+\w+\s*)?(?:implements\s+[\w,\s]+\s*)?\{([\s\S]*?)\n\}/g;
    const definitions: ParsedClassDefinition[] = [];
    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(content)) !== null) {
      definitions.push({ name: match[1], body: match[2] });
    }

    const entities = definitions.map((definition, idx) => {
      const entity = this.createParsedEntity(definition.name, idx);
      entity.attributes = this.extractJPAColumns(definition.body);
      return entity;
    });
    const entityByName = new Map(entities.map((entity) => [entity.name, entity]));
    const relations: Relation[] = [];

    for (const definition of definitions) {
      const entity = entityByName.get(definition.name);
      if (!entity) continue;
      for (const relation of this.extractJPARelations(definition.body, entity, entityByName)) {
        this.upsertParsedRelation(relations, relation);
      }
    }

    return this.buildSchema('Java', 'Hibernate', entities, relations);
  }

  private extractJPAColumns(body: string): Array<any> {
    const attrs: Array<any> = [];
    const lines = body.split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!/@Column|@Id/.test(line) || /@JoinColumn/.test(line)) continue;

      const isPK = /@Id/.test(line);
      const isNullable = /nullable\s*=\s*false/.test(line) ? false : true;
      const isUnique = /unique\s*=\s*true/.test(line);
      let fieldLine = '';
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].trim();
        if (next.startsWith('@')) continue;
        fieldLine = next;
        break;
      }

      const fieldMatch = fieldLine.match(/(?:private|protected|public)\s+(\w+)\s+(\w+)\s*;/);
      if (!fieldMatch) continue;

      const attr = createAttribute(fieldMatch[2], this.parseJavaType(fieldMatch[1]) as any, 'private');
      attr.isPrimary = isPK;
      attr.isNullable = isPK ? false : isNullable;
      attr.isUnique = isPK ? true : isUnique;
      attrs.push(attr);
    }

    return attrs;
  }

  private extractJPARelations(
    body: string,
    currentEntity: ClassEntity,
    entitiesByName: Map<string, ClassEntity>,
  ): Relation[] {
    const lines = body.split('\n');
    const relations: Relation[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      const decoratorMatch = line.match(/@(OneToMany|ManyToOne|OneToOne|ManyToMany)\b/);
      if (!decoratorMatch) continue;

      const decorator = decoratorMatch[1];
      const decorators = [line];
      let fieldLine = '';
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].trim();
        if (next.startsWith('@')) {
          decorators.push(next);
          continue;
        }
        fieldLine = next;
        break;
      }

      const collectionMatch = fieldLine.match(/(?:private|protected|public)\s+\w+<(\w+)>\s+(\w+)\s*;/);
      const scalarMatch = fieldLine.match(/(?:private|protected|public)\s+(\w+)\s+(\w+)\s*;/);
      const targetName = collectionMatch?.[1] || scalarMatch?.[1];
      const fieldName = collectionMatch?.[2] || scalarMatch?.[2];
      if (!targetName || !fieldName) continue;

      const targetEntity = entitiesByName.get(targetName);
      if (!targetEntity) continue;

      const mappedBy = decorators
        .map((entry) => entry.match(/mappedBy\s*=\s*"([^"]+)"/)?.[1])
        .find(Boolean);
      const hasJoinColumn = decorators.some((entry) => /@JoinColumn/.test(entry));
      const hasJoinTable = decorators.some((entry) => /@JoinTable/.test(entry));

      if (decorator === 'OneToMany') {
        relations.push(this.createAssociationRelation(currentEntity, targetEntity, 'OneToMany', fieldName, mappedBy, '1', '*'));
      } else if (decorator === 'ManyToOne') {
        relations.push(this.createAssociationRelation(targetEntity, currentEntity, 'OneToMany', mappedBy, fieldName, '1', '*'));
      } else if (decorator === 'OneToOne') {
        if (hasJoinColumn || !mappedBy) {
          relations.push(this.createAssociationRelation(currentEntity, targetEntity, 'OneToOne', fieldName, mappedBy, '1', '1'));
        } else {
          relations.push(this.createAssociationRelation(targetEntity, currentEntity, 'OneToOne', mappedBy, fieldName, '1', '1'));
        }
      } else if (decorator === 'ManyToMany') {
        if (hasJoinTable || !mappedBy) {
          relations.push(this.createAssociationRelation(currentEntity, targetEntity, 'ManyToMany', fieldName, mappedBy, '*', '*'));
        } else {
          relations.push(this.createAssociationRelation(targetEntity, currentEntity, 'ManyToMany', mappedBy, fieldName, '*', '*'));
        }
      }
    }

    return relations;
  }

  private parseJavaType(javaType: string): string {
    const map: Record<string, string> = {
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
      BigDecimal: 'Decimal',
    };
    return map[javaType] || 'String';
  }
}
