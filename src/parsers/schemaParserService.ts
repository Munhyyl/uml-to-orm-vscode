import type * as vscode from 'vscode';
import { basename } from 'path';
import { ProjectSchema } from '../types/schema';
import { ParseResult } from '../types/parsing';
import { getOrmCatalogEntry, normalizeProjectSchema, resolveDatabase } from '../shared/ormCatalog';
import { SchemaValidator } from '../utils/schemaValidator';
import { SchemaParserAdapter, ParserInput } from './parserUtils';
import { PrismaParserAdapter } from './adapters/prismaParserAdapter';
import { TypeOrmParserAdapter } from './adapters/typeormParserAdapter';
import { SqlAlchemyParserAdapter } from './adapters/sqlalchemyParserAdapter';
import { DjangoParserAdapter } from './adapters/djangoParserAdapter';
import { HibernateParserAdapter } from './adapters/hibernateParserAdapter';

const PARSER_ADAPTERS: SchemaParserAdapter[] = [
  new PrismaParserAdapter(),
  new TypeOrmParserAdapter(),
  new SqlAlchemyParserAdapter(),
  new DjangoParserAdapter(),
  new HibernateParserAdapter(),
];

export class SchemaParserService {
  async parseFile(uri: vscode.Uri): Promise<ParseResult> {
    const vscodeApi = await import('vscode');
    const fileData = await vscodeApi.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(fileData);
    return this.parseContent(content, basename(uri.fsPath));
  }

  async parseContent(content: string, fileName: string): Promise<ParseResult> {
    const input: ParserInput = { content, fileName };
    const adapter = this.resolveAdapter(input);
    const adapterResult = await adapter.parse(input);
    const catalogEntry = getOrmCatalogEntry(adapter.orm);
    const schema = normalizeProjectSchema({
      version: '1.0',
      entities: adapterResult.entities,
      relations: adapterResult.relations,
      config: {
        orm: adapter.orm,
        targetLanguage: catalogEntry.language,
        database: adapterResult.database,
      },
    } satisfies ProjectSchema);
    const detectedDatabase = resolveDatabase(schema.config);
    const issues = [
      ...adapterResult.issues,
      ...new SchemaValidator().validate(schema, { parseConfidence: adapterResult.confidence }),
    ];

    return {
      schema,
      issues,
      parserKind: adapter.parserKind,
      detectedOrm: adapter.orm,
      detectedDatabase,
      confidence: adapterResult.confidence,
    };
  }

  private resolveAdapter(input: ParserInput): SchemaParserAdapter {
    const candidates = PARSER_ADAPTERS.filter((adapter) => adapter.supportsFile(input.fileName));
    if (candidates.length === 0) {
      throw new Error(`Unsupported file type: ${input.fileName}`);
    }

    return candidates
      .map((adapter) => ({ adapter, score: adapter.detect(input) }))
      .sort((left, right) => right.score - left.score)[0].adapter;
  }
}
