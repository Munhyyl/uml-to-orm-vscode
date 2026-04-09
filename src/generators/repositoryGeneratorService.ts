import { OrmType, ProjectSchema } from '../types/schema';
import { normalizeProjectSchema } from '../shared/ormCatalog';
import { SchemaValidator } from '../utils/schemaValidator';
import { PrismaRepositoryGenerator } from './repository/prismaRepositoryGenerator';
import { TypeOrmRepositoryGenerator } from './repository/typeOrmRepositoryGenerator';
import { SqlAlchemyRepositoryGenerator } from './repository/sqlAlchemyRepositoryGenerator';
import { DjangoRepositoryGenerator } from './repository/djangoRepositoryGenerator';
import { HibernateRepositoryGenerator } from './repository/hibernateRepositoryGenerator';
import { getRepositoryEntities } from './repository/common';

export interface RepositoryGenerator {
  generate(schema: ProjectSchema): Promise<string>;
}

const ORM_REPOSITORY_GENERATORS: Record<OrmType, RepositoryGenerator> = {
  Prisma: new PrismaRepositoryGenerator(),
  TypeORM: new TypeOrmRepositoryGenerator(),
  SQLAlchemy: new SqlAlchemyRepositoryGenerator(),
  Django: new DjangoRepositoryGenerator(),
  Hibernate: new HibernateRepositoryGenerator(),
};

export class RepositoryGeneratorService {
  async generate(schema: ProjectSchema): Promise<string> {
    const normalizedSchema = normalizeProjectSchema(schema);
    const errors = new SchemaValidator().validate(normalizedSchema).filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      throw new Error(errors.map((issue) => issue.message).join('; '));
    }

    const repositoryEntities = getRepositoryEntities(normalizedSchema, normalizedSchema.config.orm);
    if (repositoryEntities.length === 0) {
      throw new Error('Schema has no repository-eligible entities');
    }

    const generator = ORM_REPOSITORY_GENERATORS[normalizedSchema.config.orm];
    if (!generator) {
      throw new Error(`Unsupported ORM for repository generation: ${normalizedSchema.config.orm}`);
    }

    return generator.generate(normalizedSchema);
  }
}
