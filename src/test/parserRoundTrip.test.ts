import * as assert from 'assert';
import { PrismaGenerator } from '../generators/orm/prismaGenerator';
import { TypeORMGenerator } from '../generators/orm/typeORMGenerator';
import { SQLAlchemyGenerator } from '../generators/orm/sqlalchemyGenerator';
import { DjangoGenerator } from '../generators/orm/djangoGenerator';
import { HibernateGenerator } from '../generators/orm/hibernateGenerator';
import { CodeGeneratorService } from '../generators/codeGeneratorService';
import { SchemaParserService } from '../parsers/schemaParserService';
import { DatabaseType, OrmType, ProjectSchema, TargetLanguage } from '../types/schema';

const ORM_GENERATORS = {
  Prisma: new PrismaGenerator(),
  TypeORM: new TypeORMGenerator(),
  SQLAlchemy: new SQLAlchemyGenerator(),
  Django: new DjangoGenerator(),
  Hibernate: new HibernateGenerator(),
} as const;

const ORM_LANGUAGES: Record<OrmType, TargetLanguage> = {
  Prisma: 'TypeScript',
  TypeORM: 'TypeScript',
  SQLAlchemy: 'Python',
  Django: 'Python',
  Hibernate: 'Java',
};

const ORM_FILE_NAMES: Record<OrmType, string> = {
  Prisma: 'schema.prisma',
  TypeORM: 'entities.ts',
  SQLAlchemy: 'models.py',
  Django: 'models.py',
  Hibernate: 'Entities.java',
};

function createRoundTripSchema(orm: OrmType, database: DatabaseType): ProjectSchema {
  return {
    version: '1.0',
    entities: [
      {
        id: 'entity_user',
        name: 'User',
        attributes: [
          { id: 'user_id', name: 'id', type: 'String', visibility: 'private', isPrimary: true, isNullable: false, isUnique: true },
          { id: 'user_email', name: 'email', type: 'String', visibility: 'private', isPrimary: false, isNullable: false, isUnique: true },
          { id: 'user_preferences', name: 'preferences', type: 'JSON', visibility: 'private', isPrimary: false, isNullable: true, isUnique: false },
        ],
        position: { x: 0, y: 0 },
      },
      {
        id: 'entity_profile',
        name: 'Profile',
        attributes: [
          { id: 'profile_id', name: 'id', type: 'String', visibility: 'private', isPrimary: true, isNullable: false, isUnique: true },
          { id: 'profile_bio', name: 'bio', type: 'String', visibility: 'private', isPrimary: false, isNullable: true, isUnique: false },
        ],
        position: { x: 300, y: 0 },
      },
      {
        id: 'entity_post',
        name: 'Post',
        attributes: [
          { id: 'post_id', name: 'id', type: 'String', visibility: 'private', isPrimary: true, isNullable: false, isUnique: true },
          { id: 'post_title', name: 'title', type: 'String', visibility: 'private', isPrimary: false, isNullable: false, isUnique: false },
          { id: 'post_published_at', name: 'publishedAt', type: 'DateTime', visibility: 'private', isPrimary: false, isNullable: false, isUnique: false },
          { id: 'post_price', name: 'price', type: 'Decimal', visibility: 'private', isPrimary: false, isNullable: false, isUnique: false },
          { id: 'post_attachment', name: 'attachment', type: 'Bytes', visibility: 'private', isPrimary: false, isNullable: true, isUnique: false },
        ],
        position: { x: 0, y: 300 },
      },
      {
        id: 'entity_tag',
        name: 'Tag',
        attributes: [
          { id: 'tag_id', name: 'id', type: 'String', visibility: 'private', isPrimary: true, isNullable: false, isUnique: true },
          { id: 'tag_name', name: 'name', type: 'String', visibility: 'private', isPrimary: false, isNullable: false, isUnique: true },
        ],
        position: { x: 300, y: 300 },
      },
    ],
    relations: [
      {
        id: 'rel_user_posts',
        sourceClassId: 'entity_user',
        targetClassId: 'entity_post',
        type: 'OneToMany',
        umlType: 'association',
        sourceFieldName: 'posts',
        targetFieldName: 'author',
        relationOwner: 'target',
      },
      {
        id: 'rel_user_profile',
        sourceClassId: 'entity_user',
        targetClassId: 'entity_profile',
        type: 'OneToOne',
        umlType: 'association',
        sourceFieldName: 'profile',
        targetFieldName: 'user',
        relationOwner: 'source',
      },
      {
        id: 'rel_post_tags',
        sourceClassId: 'entity_post',
        targetClassId: 'entity_tag',
        type: 'ManyToMany',
        umlType: 'association',
        sourceFieldName: 'tags',
        targetFieldName: 'posts',
        relationOwner: 'source',
      },
    ],
    config: {
      targetLanguage: ORM_LANGUAGES[orm],
      orm,
      database,
      projectName: 'roundtrip',
    },
  };
}

function normalizeSchema(schema: ProjectSchema) {
  const entityNameById = new Map(schema.entities.map((entity) => [entity.id, entity.name]));
  const entities = schema.entities
    .map((entity) => ({
      name: entity.name,
      stereotype: entity.stereotype || 'entity',
      attributes: entity.attributes
        .map((attribute) => ({
          name: attribute.name,
          type: attribute.type,
          isPrimary: attribute.isPrimary,
          isNullable: attribute.isNullable,
          isUnique: attribute.isUnique,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const relations = schema.relations
    .map((relation) => {
      const sourceName = entityNameById.get(relation.sourceClassId) || relation.sourceClassId;
      const targetName = entityNameById.get(relation.targetClassId) || relation.targetClassId;
      if (relation.type === 'ManyToMany' && sourceName.localeCompare(targetName) > 0) {
        return {
          type: relation.type,
          source: targetName,
          target: sourceName,
          sourceFieldName: relation.targetFieldName || '',
          targetFieldName: relation.sourceFieldName || '',
          relationOwner: relation.relationOwner || 'source',
        };
      }
      return {
        type: relation.type,
        source: sourceName,
        target: targetName,
        sourceFieldName: relation.sourceFieldName || '',
        targetFieldName: relation.targetFieldName || '',
        relationOwner: relation.relationOwner || 'source',
      };
    })
    .sort((left, right) => `${left.type}:${left.source}:${left.target}:${left.sourceFieldName}`.localeCompare(`${right.type}:${right.source}:${right.target}:${right.sourceFieldName}`));

  return {
    config: {
      orm: schema.config.orm,
      language: schema.config.targetLanguage,
      database: schema.config.database,
    },
    entities,
    relations,
  };
}

suite('Parser Round-Trip', () => {
  (Object.keys(ORM_GENERATORS) as OrmType[]).forEach((orm) => {
    (['PostgreSQL', 'MySQL'] as DatabaseType[]).forEach((database) => {
      test(`${orm} canonical code round-trips on ${database}`, async () => {
        const schema = createRoundTripSchema(orm, database);
        const generated = await ORM_GENERATORS[orm].generate(schema);
        const parseResult = await new SchemaParserService().parseContent(generated, ORM_FILE_NAMES[orm]);

        assert.strictEqual(parseResult.detectedOrm, orm);
        assert.strictEqual(parseResult.detectedDatabase, database);
        assert.ok(parseResult.confidence >= 0.55, `expected confidence >= 0.55, got ${parseResult.confidence}`);
        assert.deepStrictEqual(normalizeSchema(parseResult.schema), normalizeSchema(schema));
      });
    });
  });

  test('Prisma parser returns recoverable issues for partial syntax instead of crashing', async () => {
    const partialSchema = `
datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
}

model User {
  id String @id
  broken ???
}
`;

    const parseResult = await new SchemaParserService().parseContent(partialSchema, 'schema.prisma');

    assert.strictEqual(parseResult.detectedOrm, 'Prisma');
    assert.ok(parseResult.issues.length > 0);
    assert.ok(parseResult.schema.entities.some((entity) => entity.name === 'User'));
  });

  test('large canonical schema stays within the parser and generator performance threshold', async function () {
    this.timeout(5000);
    const entities = Array.from({ length: 100 }, (_, index) => ({
      id: `entity_${index}`,
      name: `Entity${index}`,
      attributes: [
        { id: `attr_${index}_id`, name: 'id', type: 'String' as const, visibility: 'private' as const, isPrimary: true, isNullable: false, isUnique: true },
        { id: `attr_${index}_name`, name: 'name', type: 'String' as const, visibility: 'private' as const, isPrimary: false, isNullable: false, isUnique: false },
      ],
      position: { x: 0, y: index * 40 },
    }));
    const schema: ProjectSchema = {
      version: '1.0',
      entities,
      relations: [],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
        database: 'PostgreSQL',
        projectName: 'perf',
      },
    };

    const generator = new CodeGeneratorService();
    const parser = new SchemaParserService();

    const generateStart = Date.now();
    const artifacts = await generator.generateArtifacts(schema);
    const generateDuration = Date.now() - generateStart;

    const parseStart = Date.now();
    const parsed = await parser.parseContent(artifacts.ormCode, 'schema.prisma');
    const parseDuration = Date.now() - parseStart;

    assert.ok(generateDuration < 2000, `generation exceeded threshold: ${generateDuration}ms`);
    assert.ok(parseDuration < 2000, `parse exceeded threshold: ${parseDuration}ms`);
    assert.strictEqual(parsed.schema.entities.length, 100);
  });
});
