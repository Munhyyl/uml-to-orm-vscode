import * as assert from 'assert';
import { SchemaValidator } from '../utils/schemaValidator';
import { ProjectSchema } from '../types/schema';

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

    assert.ok(errors.some((e) => e.type === 'warning' && e.message.includes('no entities')));
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

    assert.strictEqual(errors.filter((e) => e.type === 'error').length, 0);
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
});
