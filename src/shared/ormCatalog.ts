import { DatabaseType, OrmType, ProjectConfig, ProjectSchema, TargetLanguage } from '../types/schema';
import { ParserKind } from '../types/parsing';

export interface OrmCatalogEntry {
  orm: OrmType;
  language: TargetLanguage;
  supportsDatabases: readonly DatabaseType[];
  outputExtension: string;
  saveFilters: Record<string, string[]>;
  repositoryOutputExtension: string;
  repositorySaveFilters: Record<string, string[]>;
  fileExtensions: readonly string[];
  canonicalSingleFile: boolean;
  parserStrategy: ParserKind;
  supportsReverse: boolean;
}

const ORM_CATALOG: Record<OrmType, OrmCatalogEntry> = {
  Prisma: {
    orm: 'Prisma',
    language: 'TypeScript',
    supportsDatabases: ['PostgreSQL', 'MySQL'],
    outputExtension: 'prisma',
    saveFilters: { 'Prisma Schema': ['prisma'] },
    repositoryOutputExtension: 'ts',
    repositorySaveFilters: { TypeScript: ['ts'] },
    fileExtensions: ['prisma'],
    canonicalSingleFile: true,
    parserStrategy: 'prisma-dsl',
    supportsReverse: true,
  },
  TypeORM: {
    orm: 'TypeORM',
    language: 'TypeScript',
    supportsDatabases: ['PostgreSQL', 'MySQL'],
    outputExtension: 'ts',
    saveFilters: { 'TypeScript': ['ts'] },
    repositoryOutputExtension: 'ts',
    repositorySaveFilters: { TypeScript: ['ts'] },
    fileExtensions: ['ts', 'js'],
    canonicalSingleFile: true,
    parserStrategy: 'typescript-ast',
    supportsReverse: true,
  },
  SQLAlchemy: {
    orm: 'SQLAlchemy',
    language: 'Python',
    supportsDatabases: ['PostgreSQL', 'MySQL'],
    outputExtension: 'py',
    saveFilters: { Python: ['py'] },
    repositoryOutputExtension: 'py',
    repositorySaveFilters: { Python: ['py'] },
    fileExtensions: ['py'],
    canonicalSingleFile: true,
    parserStrategy: 'python-cst',
    supportsReverse: true,
  },
  Django: {
    orm: 'Django',
    language: 'Python',
    supportsDatabases: ['PostgreSQL', 'MySQL'],
    outputExtension: 'py',
    saveFilters: { Python: ['py'] },
    repositoryOutputExtension: 'py',
    repositorySaveFilters: { Python: ['py'] },
    fileExtensions: ['py'],
    canonicalSingleFile: true,
    parserStrategy: 'python-cst',
    supportsReverse: true,
  },
  Hibernate: {
    orm: 'Hibernate',
    language: 'Java',
    supportsDatabases: ['PostgreSQL', 'MySQL'],
    outputExtension: 'java',
    saveFilters: { Java: ['java'] },
    repositoryOutputExtension: 'java',
    repositorySaveFilters: { Java: ['java'] },
    fileExtensions: ['java'],
    canonicalSingleFile: true,
    parserStrategy: 'java-ast',
    supportsReverse: true,
  },
};

const ALL_LANGUAGES: TargetLanguage[] = ['TypeScript', 'Python', 'Java'];

export function getAllTargetLanguages(): TargetLanguage[] {
  return [...ALL_LANGUAGES];
}

export function getOrmCatalogEntry(orm: OrmType): OrmCatalogEntry {
  return ORM_CATALOG[orm];
}

export function getOrmsForLanguage(language: TargetLanguage): OrmType[] {
  return Object.values(ORM_CATALOG)
    .filter((entry) => entry.language === language)
    .map((entry) => entry.orm);
}

export function getSupportedDatabases(orm: OrmType): DatabaseType[] {
  return [...getOrmCatalogEntry(orm).supportsDatabases];
}

export function getDefaultDatabase(orm: OrmType): DatabaseType {
  return getOrmCatalogEntry(orm).supportsDatabases[0];
}

export function resolveDatabase(config: Pick<ProjectConfig, 'orm' | 'database'>): DatabaseType {
  if (config.database && getSupportedDatabases(config.orm).includes(config.database)) {
    return config.database;
  }
  return getDefaultDatabase(config.orm);
}

export function normalizeProjectConfig(config: ProjectConfig): ProjectConfig {
  return {
    ...config,
    database: resolveDatabase(config),
  };
}

export function normalizeProjectSchema(schema: ProjectSchema): ProjectSchema {
  return {
    ...schema,
    entities: schema.entities.map((entity) => ({
      ...entity,
      attributes: entity.attributes.map((attribute) => ({
        ...attribute,
        indexGroups: attribute.indexGroups ? [...attribute.indexGroups] : undefined,
        uniqueGroups: attribute.uniqueGroups ? [...attribute.uniqueGroups] : undefined,
      })),
    })),
    relations: schema.relations.map((relation) => ({
      ...relation,
      relationOwner: relation.relationOwner || (!['inheritance', 'realization', 'dependency'].includes(relation.umlType) ? 'source' : 'none'),
    })),
    config: normalizeProjectConfig(schema.config),
  };
}

export function isOrmCompatibleWithLanguage(orm: OrmType, language: TargetLanguage): boolean {
  return getOrmCatalogEntry(orm).language === language;
}

export function getOutputExtension(orm: OrmType): string {
  return getOrmCatalogEntry(orm).outputExtension;
}

export function getOutputFilters(orm: OrmType): Record<string, string[]> {
  return getOrmCatalogEntry(orm).saveFilters;
}

export function getRepositoryOutputExtension(orm: OrmType): string {
  return getOrmCatalogEntry(orm).repositoryOutputExtension;
}

export function getRepositoryOutputFilters(orm: OrmType): Record<string, string[]> {
  return getOrmCatalogEntry(orm).repositorySaveFilters;
}

export function getDatabaseSlug(database: DatabaseType): string {
  return database === 'MySQL' ? 'mysql' : 'postgresql';
}

export function buildGeneratedFileName(projectName: string, orm: OrmType, database: DatabaseType): string {
  return `${projectName}_${orm.toLowerCase()}_${getDatabaseSlug(database)}.${getOutputExtension(orm)}`;
}

export function buildDdlFileName(projectName: string, database: DatabaseType): string {
  return `${projectName}_ddl_${getDatabaseSlug(database)}.sql`;
}

export function buildRepositoryFileName(projectName: string, orm: OrmType, database: DatabaseType): string {
  return `${projectName}_repository_${getDatabaseSlug(database)}.${getRepositoryOutputExtension(orm)}`;
}
