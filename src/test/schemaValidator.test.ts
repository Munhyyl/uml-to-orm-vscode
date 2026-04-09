import * as assert from 'assert';
import { SchemaValidator } from '../utils/schemaValidator';
import { ProjectSchema } from '../types/schema';

function createValidSchema(): ProjectSchema {
  return {
    version: '1.0',
    entities: [
      {
        id: 'user',
        name: 'User',
        attributes: [
          {
            id: 'user_id',
            name: 'id',
            type: 'String',
            visibility: 'private',
            isPrimary: true,
            isNullable: false,
            isUnique: true,
          },
          {
            id: 'user_email',
            name: 'email',
            type: 'String',
            visibility: 'private',
            isPrimary: false,
            isNullable: false,
            isUnique: true,
          },
        ],
        position: { x: 0, y: 0 },
      },
    ],
    relations: [],
    config: {
      targetLanguage: 'TypeScript',
      orm: 'Prisma',
      database: 'PostgreSQL',
    },
  };
}

suite('SchemaValidator', () => {
  test('should detect empty schema', () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [],
      relations: [],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
      },
    };

    const validator = new SchemaValidator();
    const errors = validator.validate(schema);

    assert.ok(errors.some((e) => e.severity === 'warning' && e.message.includes('no entities')));
  });

  test('should detect duplicate entity names', () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: '1',
          name: 'User',
          attributes: [],
          position: { x: 0, y: 0 },
        },
        {
          id: '2',
          name: 'User',
          attributes: [],
          position: { x: 100, y: 0 },
        },
      ],
      relations: [],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
      },
    };

    const validator = new SchemaValidator();
    const errors = validator.validate(schema);

    assert.ok(errors.some((e) => e.message.includes('Duplicate entity name')));
  });

  test('should validate valid schema', () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: '1',
          name: 'User',
          attributes: [
            {
              id: '1',
              name: 'id',
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
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
      },
    };

    const validator = new SchemaValidator();
    const errors = validator.validate(schema);

    assert.strictEqual(errors.filter((e) => e.severity === 'error').length, 0);
  });

  test('should detect invalid relation references', () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: '1',
          name: 'User',
          attributes: [
            { id: '1', name: 'id', type: 'String', visibility: 'private', isPrimary: true, isNullable: false, isUnique: true },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [
        {
          id: 'rel_1',
          sourceClassId: '1',
          targetClassId: 'nonexistent',
          type: 'OneToMany',
          umlType: 'association',
        },
      ],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
      },
    };

    const validator = new SchemaValidator();
    const errors = validator.validate(schema);

    assert.ok(errors.some((e) => e.message.includes('non-existent')));
  });

  test('should reject incompatible ORM and language combinations', () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [],
      relations: [],
      config: {
        targetLanguage: 'Java',
        orm: 'Prisma',
      },
    };

    const validator = new SchemaValidator();
    const errors = validator.validate(schema);

    assert.ok(errors.some((e) => e.message.includes('not compatible with language')));
  });

  test('should reject unsupported databases for an ORM', () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [],
      relations: [],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
        database: 'SQLite' as any,
      },
    };

    const validator = new SchemaValidator();
    const errors = validator.validate(schema);

    assert.ok(errors.some((e) => e.message.includes('not supported for ORM')));
  });

  test('should emit an error when parse confidence is too low', () => {
    const errors = new SchemaValidator().validate(createValidSchema(), { parseConfidence: 0.2 });

    assert.ok(errors.some((e) => e.code === 'PARSE_CONFIDENCE_LOW' && e.severity === 'error'));
  });

  test('should emit a warning when parse confidence is moderate', () => {
    const errors = new SchemaValidator().validate(createValidSchema(), { parseConfidence: 0.5 });

    assert.ok(errors.some((e) => e.code === 'PARSE_CONFIDENCE_MEDIUM' && e.severity === 'warning'));
  });

  test('should detect duplicate physical table names', () => {
    const schema = createValidSchema();
    schema.entities.push({
      id: 'account',
      name: 'Account',
      tableName: 'user',
      attributes: [
        {
          id: 'account_id',
          name: 'id',
          type: 'String',
          visibility: 'private',
          isPrimary: true,
          isNullable: false,
          isUnique: true,
        },
      ],
      position: { x: 100, y: 0 },
    });

    const errors = new SchemaValidator().validate(schema);

    assert.ok(errors.some((e) => e.code === 'TABLE_NAME_DUPLICATE'));
  });

  test('should detect duplicate physical column names', () => {
    const schema = createValidSchema();
    schema.entities[0].attributes.push({
      id: 'user_email_alias',
      name: 'emailAlias',
      columnName: 'email',
      type: 'String',
      visibility: 'private',
      isPrimary: false,
      isNullable: true,
      isUnique: false,
    });

    const errors = new SchemaValidator().validate(schema);

    assert.ok(errors.some((e) => e.code === 'COLUMN_NAME_DUPLICATE'));
  });

  test('should reject attributes that define both defaultValue and defaultExpression', () => {
    const schema = createValidSchema();
    schema.entities[0].attributes.push({
      id: 'user_created_at',
      name: 'createdAt',
      type: 'DateTime',
      visibility: 'private',
      isPrimary: false,
      isNullable: false,
      isUnique: false,
      defaultValue: 'now()',
      defaultExpression: 'CURRENT_TIMESTAMP',
    });

    const errors = new SchemaValidator().validate(schema);

    assert.ok(errors.some((e) => e.code === 'DEFAULT_CONFLICT'));
  });
});
