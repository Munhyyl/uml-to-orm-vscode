import * as assert from 'assert';
import { PrismaGenerator } from '../generators/orm/prismaGenerator';
import { TypeORMGenerator } from '../generators/orm/typeORMGenerator';
import { DjangoGenerator } from '../generators/orm/djangoGenerator';
import { SQLAlchemyGenerator } from '../generators/orm/sqlalchemyGenerator';
import { HibernateGenerator } from '../generators/orm/hibernateGenerator';
import { ProjectSchema } from '../types/schema';

suite('Generator Regression', () => {
  test('Prisma uses the actual target primary key name in relations', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_user',
          name: 'User',
          attributes: [
            {
              id: 'attr_user_uuid',
              name: 'uuid',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
          ],
          position: { x: 0, y: 0 },
        },
        {
          id: 'entity_post',
          name: 'Post',
          attributes: [
            {
              id: 'attr_post_id',
              name: 'id',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
          ],
          position: { x: 300, y: 0 },
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
        },
      ],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
      },
    };

    const code = await new PrismaGenerator().generate(schema);

    assert.ok(code.includes('references: [uuid]'));
    assert.ok(code.includes('authorUuid'));
  });

  test('Prisma switches datasource provider based on target database', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [],
      relations: [],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
        database: 'MySQL',
      },
    };

    const code = await new PrismaGenerator().generate(schema);

    assert.ok(code.includes('provider = "mysql"'));
    assert.ok(code.includes('Target database: MySQL'));
  });

  test('TypeORM interface generation does not emit an empty typeorm import', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_contract',
          name: 'UserContract',
          stereotype: 'interface',
          attributes: [],
          methods: [],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'TypeORM',
      },
    };

    const code = await new TypeORMGenerator().generate(schema);

    assert.ok(!code.includes(`import {  } from 'typeorm';`));
    assert.ok(code.includes('export interface UserContract'));
  });

  test('TypeORM maps JSON columns differently for PostgreSQL and MySQL', async () => {
    const baseSchema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_audit_log',
          name: 'AuditLog',
          attributes: [
            {
              id: 'attr_audit_id',
              name: 'id',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
            {
              id: 'attr_audit_payload',
              name: 'payload',
              type: 'JSON',
              visibility: 'private',
              isPrimary: false,
              isNullable: false,
              isUnique: false,
            },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'TypeORM',
        database: 'PostgreSQL',
      },
    };

    const postgresCode = await new TypeORMGenerator().generate(baseSchema);
    const mysqlCode = await new TypeORMGenerator().generate({
      ...baseSchema,
      config: {
        ...baseSchema.config,
        database: 'MySQL',
      },
    });

    assert.ok(postgresCode.includes(`type: 'jsonb'`));
    assert.ok(mysqlCode.includes(`type: 'json'`));
  });

  test('TypeORM preserves UML methods as non-executable placeholders', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_audit_log',
          name: 'AuditLog',
          attributes: [],
          methods: [
            {
              id: 'method_audit_archive',
              name: 'archive',
              returnType: 'void',
              visibility: 'public',
              isStatic: false,
              isAbstract: false,
              parameters: [
                {
                  name: 'reason',
                  type: 'String',
                },
              ],
            },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'TypeORM',
        database: 'PostgreSQL',
      },
    };

    const code = await new TypeORMGenerator().generate(schema);

    assert.ok(code.includes('// UML method placeholder: archive(reason: String): void'));
    assert.ok(!code.includes(`throw new Error('Not implemented');`));
  });

  test('Django preserves non-default primary keys', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_user',
          name: 'User',
          attributes: [
            {
              id: 'attr_user_uuid',
              name: 'uuid',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [],
      config: {
        targetLanguage: 'Python',
        orm: 'Django',
      },
    };

    const code = await new DjangoGenerator().generate(schema);

    assert.ok(code.includes(`uuid = models.CharField(`));
    assert.ok(code.includes('primary_key=True'));
  });

  test('SQLAlchemy foreign keys point to the actual primary key column', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_user',
          name: 'User',
          attributes: [
            {
              id: 'attr_user_uuid',
              name: 'uuid',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
          ],
          position: { x: 0, y: 0 },
        },
        {
          id: 'entity_post',
          name: 'Post',
          attributes: [
            {
              id: 'attr_post_id',
              name: 'id',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
          ],
          position: { x: 300, y: 0 },
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
        },
      ],
      config: {
        targetLanguage: 'Python',
        orm: 'SQLAlchemy',
      },
    };

    const code = await new SQLAlchemyGenerator().generate(schema);

    assert.ok(code.includes(`ForeignKey('user.uuid')`));
    assert.ok(code.includes('user_uuid = Column('));
  });

  test('SQLAlchemy uses PostgreSQL-specific JSONB when PostgreSQL is selected', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_event',
          name: 'Event',
          attributes: [
            {
              id: 'attr_event_id',
              name: 'id',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
            {
              id: 'attr_event_payload',
              name: 'payload',
              type: 'JSON',
              visibility: 'private',
              isPrimary: false,
              isNullable: false,
              isUnique: false,
            },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [],
      config: {
        targetLanguage: 'Python',
        orm: 'SQLAlchemy',
        database: 'PostgreSQL',
      },
    };

    const code = await new SQLAlchemyGenerator().generate(schema);

    assert.ok(code.includes('from sqlalchemy.dialects.postgresql import JSONB'));
    assert.ok(code.includes("create_engine('postgresql+psycopg://"));
    assert.ok(code.includes('Column(JSONB'));
  });

  test('Hibernate uses database-specific JSON column definitions', async () => {
    const baseSchema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_document',
          name: 'Document',
          attributes: [
            {
              id: 'attr_document_id',
              name: 'id',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
            {
              id: 'attr_document_metadata',
              name: 'metadata',
              type: 'JSON',
              visibility: 'private',
              isPrimary: false,
              isNullable: false,
              isUnique: false,
            },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [],
      config: {
        targetLanguage: 'Java',
        orm: 'Hibernate',
        database: 'PostgreSQL',
      },
    };

    const postgresCode = await new HibernateGenerator().generate(baseSchema);
    const mysqlCode = await new HibernateGenerator().generate({
      ...baseSchema,
      config: {
        ...baseSchema.config,
        database: 'MySQL',
      },
    });

    assert.ok(postgresCode.includes('columnDefinition = "jsonb"'));
    assert.ok(mysqlCode.includes('columnDefinition = "json"'));
  });

  test('Hibernate maps DateTime, Decimal, and Bytes with database-specific column definitions', async () => {
    const baseSchema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_asset',
          name: 'Asset',
          attributes: [
            {
              id: 'attr_asset_id',
              name: 'id',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
            {
              id: 'attr_asset_created',
              name: 'createdAt',
              type: 'DateTime',
              visibility: 'private',
              isPrimary: false,
              isNullable: false,
              isUnique: false,
            },
            {
              id: 'attr_asset_price',
              name: 'price',
              type: 'Decimal',
              visibility: 'private',
              isPrimary: false,
              isNullable: false,
              isUnique: false,
            },
            {
              id: 'attr_asset_blob',
              name: 'binaryPayload',
              type: 'Bytes',
              visibility: 'private',
              isPrimary: false,
              isNullable: true,
              isUnique: false,
            },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [],
      config: {
        targetLanguage: 'Java',
        orm: 'Hibernate',
        database: 'PostgreSQL',
      },
    };

    const postgresCode = await new HibernateGenerator().generate(baseSchema);
    const mysqlCode = await new HibernateGenerator().generate({
      ...baseSchema,
      config: {
        ...baseSchema.config,
        database: 'MySQL',
      },
    });

    assert.ok(postgresCode.includes('columnDefinition = "timestamp"'));
    assert.ok(mysqlCode.includes('columnDefinition = "datetime(6)"'));
    assert.ok(postgresCode.includes('columnDefinition = "numeric(19,4)"'));
    assert.ok(mysqlCode.includes('columnDefinition = "decimal(19,4)"'));
    assert.ok(postgresCode.includes('columnDefinition = "bytea"'));
    assert.ok(mysqlCode.includes('columnDefinition = "longblob"'));
  });

  test('Hibernate preserves UML methods as non-executable placeholders', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_asset',
          name: 'Asset',
          attributes: [],
          methods: [
            {
              id: 'method_asset_archive',
              name: 'archive',
              returnType: 'void',
              visibility: 'public',
              isStatic: false,
              isAbstract: false,
              parameters: [
                {
                  name: 'force',
                  type: 'Boolean',
                },
              ],
            },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [],
      config: {
        targetLanguage: 'Java',
        orm: 'Hibernate',
        database: 'PostgreSQL',
      },
    };

    const code = await new HibernateGenerator().generate(schema);

    assert.ok(code.includes('// UML method placeholder: public void archive(Boolean force)'));
    assert.ok(!code.includes('UnsupportedOperationException("Not implemented")'));
  });
});
