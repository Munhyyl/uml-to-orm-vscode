import { ProjectSchema } from '../types/schema';
import { PrismaGenerator } from './orm/prismaGenerator';
import { TypeORMGenerator } from './orm/typeORMGenerator';
import { SQLAlchemyGenerator } from './orm/sqlalchemyGenerator';
import { HibernateGenerator } from './orm/hibernateGenerator';
import { DjangoGenerator } from './orm/djangoGenerator';

export interface CodeGenerator {
  generate(schema: ProjectSchema): Promise<string>;
}

export class CodeGeneratorService {
  private generators: Map<string, CodeGenerator>;

  constructor() {
    this.generators = new Map<string, CodeGenerator>([
      ['Prisma', new PrismaGenerator()],
      ['TypeORM', new TypeORMGenerator()],
      ['SQLAlchemy', new SQLAlchemyGenerator()],
      ['Hibernate', new HibernateGenerator()],
      ['Django', new DjangoGenerator()],
    ]);
  }

  async generate(schema: ProjectSchema): Promise<string> {
    const generator = this.generators.get(schema.config.orm);
    if (!generator) {
      throw new Error(`Unsupported ORM: ${schema.config.orm}`);
    }
    return generator.generate(schema);
  }
}
