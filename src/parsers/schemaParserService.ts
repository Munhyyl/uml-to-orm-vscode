import * as vscode from 'vscode';
import { ProjectSchema, Relation } from '../types/schema';
import { createEntity, createAttribute } from '../domain/schema/schemaOperations';

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

  // ─── Prisma Parser ──────────────────────────────────────────────

  private parsePrismaSchema(content: string): ProjectSchema {
    const models = this.extractPrismaModels(content);
    const modelNames = models.map((m) => m.name);

    const entities = models.map((model, idx) => {
      const entity = createEntity(model.name, { x: (idx % 3) * 320, y: Math.floor(idx / 3) * 280 });
      entity.attributes = model.fields
        .filter((f) => !modelNames.includes(f.rawType.replace('[]', '').replace('?', '')))
        .map((field) => {
          const attr = createAttribute(field.name, this.parsePrismaType(field.rawType) as any, 'private');
          attr.isPrimary = field.hasId;
          attr.isNullable = field.isOptional;
          attr.isUnique = field.hasUnique;
          return attr;
        });
      return entity;
    });

    // Parse relations from relation fields
    const relations: Relation[] = [];
    for (const model of models) {
      const sourceIdx = models.indexOf(model);
      for (const field of model.fields) {
        const cleanType = field.rawType.replace('[]', '').replace('?', '');
        const targetIdx = models.findIndex((m) => m.name === cleanType);
        if (targetIdx === -1) continue;
        // Only create relation from the side that has @relation or is the array side to avoid duplicates
        const isArray = field.rawType.includes('[]');
        const alreadyExists = relations.some(
          (r) =>
            (r.sourceClassId === `entity_${sourceIdx}` && r.targetClassId === `entity_${targetIdx}`) ||
            (r.sourceClassId === `entity_${targetIdx}` && r.targetClassId === `entity_${sourceIdx}`)
        );
        if (alreadyExists) continue;

        let relType: Relation['type'] = 'OneToMany';
        // Check if the reverse field is also an array → ManyToMany
        const targetModel = models[targetIdx];
        const reverseField = targetModel.fields.find(
          (f) => f.rawType.replace('[]', '').replace('?', '') === model.name
        );
        if (isArray && reverseField && reverseField.rawType.includes('[]')) {
          relType = 'ManyToMany';
        } else if (!isArray && reverseField && !reverseField.rawType.includes('[]')) {
          relType = 'OneToOne';
        }

        relations.push({
          id: `relation_${relations.length}`,
          sourceClassId: isArray ? `entity_${targetIdx}` : `entity_${sourceIdx}`,
          targetClassId: isArray ? `entity_${sourceIdx}` : `entity_${targetIdx}`,
          type: relType,
          umlType: 'association', // Default: parsed ORM relations map to UML associations
          sourceFieldName: field.name,
        });
      }
    }

    return {
      version: '1.0',
      entities,
      relations,
      config: {
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
      },
    };
  }

  private extractPrismaModels(
    content: string
  ): Array<{
    name: string;
    fields: Array<{ name: string; rawType: string; hasId: boolean; isOptional: boolean; hasUnique: boolean }>;
  }> {
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
    const models = [];
    let match;

    while ((match = modelRegex.exec(content)) !== null) {
      const modelName = match[1];
      const modelBody = match[2];
      const fields = this.extractPrismaFields(modelBody);
      models.push({ name: modelName, fields });
    }

    return models;
  }

  private extractPrismaFields(
    content: string
  ): Array<{ name: string; rawType: string; hasId: boolean; isOptional: boolean; hasUnique: boolean }> {
    const lines = content.split('\n');
    const fields = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)/);
      if (!fieldMatch) continue;

      const name = fieldMatch[1];
      const rawType = fieldMatch[2];

      // Check decorators on the same line
      const hasId = /@id\b/.test(trimmed);
      const hasUnique = /@unique\b/.test(trimmed);
      const isOptional = rawType.endsWith('?');

      fields.push({ name, rawType, hasId, isOptional, hasUnique });
    }

    return fields;
  }

  private parsePrismaType(type: string): string {
    const clean = type.replace('?', '').replace('[]', '');
    const mapping: { [key: string]: string } = {
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

    // Fallback: try both
    return this.parseSQLAlchemySchema(content);
  }

  private parseSQLAlchemySchema(content: string): ProjectSchema {
    const classRegex = /class\s+(\w+)\s*\([^)]*Base[^)]*\)\s*:/g;
    const entities = [];
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const classStart = match.index + match[0].length;
      const classBody = this.extractPythonClassBody(content, classStart);
      const attributes = this.extractSQLAlchemyColumns(classBody);
      const entity = createEntity(className, { x: (entities.length % 3) * 320, y: Math.floor(entities.length / 3) * 280 });
      entity.attributes = attributes;
      entities.push(entity);
    }

    return {
      version: '1.0',
      entities,
      relations: [],
      config: { targetLanguage: 'Python', orm: 'SQLAlchemy' },
    };
  }

  private parseDjangoSchema(content: string): ProjectSchema {
    const classRegex = /class\s+(\w+)\s*\(\s*models\.Model\s*\)\s*:/g;
    const entities = [];
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const classStart = match.index + match[0].length;
      const classBody = this.extractPythonClassBody(content, classStart);
      const attributes = this.extractDjangoFields(classBody);
      const entity = createEntity(className, { x: (entities.length % 3) * 320, y: Math.floor(entities.length / 3) * 280 });
      entity.attributes = attributes;
      entities.push(entity);
    }

    return {
      version: '1.0',
      entities,
      relations: [],
      config: { targetLanguage: 'Python', orm: 'Django' },
    };
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
    const attrs = [];
    let match;

    while ((match = colRegex.exec(body)) !== null) {
      const name = match[1];
      const args = match[2];
      const isPrimary = /primary_key\s*=\s*True/.test(args);
      const isNullable = /nullable\s*=\s*False/.test(args) ? false : true;
      const isUnique = /unique\s*=\s*True/.test(args);
      const type = this.parseSAColumnType(args);

      const attr = createAttribute(name, type as any, 'private');
      attr.isPrimary = isPrimary;
      attr.isNullable = isNullable;
      attr.isUnique = isUnique;
      attrs.push(attr);
    }
    return attrs;
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
    const attrs = [];
    let match;

    while ((match = fieldRegex.exec(body)) !== null) {
      const name = match[1];
      const fieldType = match[2];
      const args = match[3];
      const isNullable = /null\s*=\s*True/.test(args);
      const isUnique = /unique\s*=\s*True/.test(args);
      const isPrimary = /primary_key\s*=\s*True/.test(args);
      const type = this.parseDjangoFieldType(fieldType);

      const attr = createAttribute(name, type as any, 'private');
      attr.isPrimary = isPrimary;
      attr.isNullable = isNullable;
      attr.isUnique = isUnique;
      attrs.push(attr);
    }
    return attrs;
  }

  private parseDjangoFieldType(fieldType: string): string {
    const map: { [key: string]: string } = {
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
    const classRegex = /@Entity\(\)[\s\S]*?export\s+class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    const entities = [];
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const classBody = match[2];
      const attributes = this.extractTypeORMColumns(classBody);
      const entity = createEntity(className, { x: (entities.length % 3) * 320, y: Math.floor(entities.length / 3) * 280 });
      entity.attributes = attributes;
      entities.push(entity);
    }

    return {
      version: '1.0',
      entities,
      relations: [],
      config: { targetLanguage: 'TypeScript', orm: 'TypeORM' },
    };
  }

  private extractTypeORMColumns(body: string): Array<any> {
    const attrs = [];
    const lines = body.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isPK = /@PrimaryGeneratedColumn|@PrimaryColumn/.test(line);
      const isCol = /@Column/.test(line);
      if (!isPK && !isCol) continue;

      // Parse column options
      const isNullable = /nullable\s*:\s*true/.test(line);
      const isUnique = /unique\s*:\s*true/.test(line);

      // Next non-decorator line should be the field declaration
      let fieldLine = '';
      for (let j = i + 1; j < lines.length; j++) {
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

  private parseTSType(tsType: string): string {
    const map: { [key: string]: string } = {
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
    const entities = [];
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const classBody = match[2];
      const attributes = this.extractJPAColumns(classBody);
      const entity = createEntity(className, { x: (entities.length % 3) * 320, y: Math.floor(entities.length / 3) * 280 });
      entity.attributes = attributes;
      entities.push(entity);
    }

    return {
      version: '1.0',
      entities,
      relations: [],
      config: { targetLanguage: 'Java', orm: 'Hibernate' },
    };
  }

  private extractJPAColumns(body: string): Array<any> {
    const attrs = [];
    const lines = body.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!/@Column|@Id/.test(line) || /@JoinColumn/.test(line)) continue;

      const isPK = /@Id/.test(line);
      const isNullable = /nullable\s*=\s*false/.test(line) ? false : true;
      const isUnique = /unique\s*=\s*true/.test(line);

      // Scan forward to find the field declaration (private Type name;)
      let fieldLine = '';
      for (let j = i + 1; j < lines.length; j++) {
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

  private parseJavaType(javaType: string): string {
    const map: { [key: string]: string } = {
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
