import { OrmType, ProjectSchema } from '../types/schema';
import { PrismaGenerator } from './orm/prismaGenerator';
import { TypeORMGenerator } from './orm/typeORMGenerator';
import { SQLAlchemyGenerator } from './orm/sqlalchemyGenerator';
import { HibernateGenerator } from './orm/hibernateGenerator';
import { DjangoGenerator } from './orm/djangoGenerator';
import { normalizeProjectSchema } from '../shared/ormCatalog';
import { SchemaValidator } from '../utils/schemaValidator';
import { DdlGeneratorService } from './ddlGeneratorService';

export interface CodeGenerator {
  generate(schema: ProjectSchema): Promise<string>;
}

export interface GeneratedArtifacts {
  ormCode: string;
  ddl: string;
}

const ORM_GENERATORS: Record<OrmType, CodeGenerator> = {
  Prisma: new PrismaGenerator(),
  TypeORM: new TypeORMGenerator(),
  SQLAlchemy: new SQLAlchemyGenerator(),
  Hibernate: new HibernateGenerator(),
  Django: new DjangoGenerator(),
};

export class CodeGeneratorService {
  async generate(schema: ProjectSchema): Promise<string> {
    return (await this.generateArtifacts(schema)).ormCode;
  }

  async generateArtifacts(schema: ProjectSchema): Promise<GeneratedArtifacts> {
    const normalizedSchema = normalizeProjectSchema(schema);
    const errors = new SchemaValidator().validate(normalizedSchema).filter((error) => error.severity === 'error');
    if (errors.length > 0) {
      throw new Error(errors.map((error) => error.message).join('; '));
    }

    const generator = ORM_GENERATORS[normalizedSchema.config.orm];
    if (!generator) {
      throw new Error(`Unsupported ORM: ${normalizedSchema.config.orm}`);
    }
    const ormCode = await generator.generate(normalizedSchema);
    const ddl = new DdlGeneratorService().generate(normalizedSchema);
    return { ormCode, ddl };
  }
}
