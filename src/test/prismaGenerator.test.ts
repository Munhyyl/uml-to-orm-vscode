import * as assert from 'assert';
import { PrismaGenerator } from '../generators/orm/prismaGenerator';
import { ProjectSchema } from '../types/schema';

suite('PrismaGenerator', () => {
  test('should generate valid Prisma schema', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_1',
          name: 'User',
          attributes: [
            {
              id: 'attr_1',
              name: 'id',
              type: 'String',
              visibility: 'private',
              isPrimary: true,
              isNullable: false,
              isUnique: true,
            },
            {
              id: 'attr_2',
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
        projectName: 'TestProject',
      },
    };

    const generator = new PrismaGenerator();
    const code = await generator.generate(schema);

    assert.ok(code.includes('model User'));
    assert.ok(code.includes('id'));
    assert.ok(code.includes('email'));
    assert.ok(code.includes('@id'));
    assert.ok(code.includes('@unique'));
  });

  test('should map data types correctly', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_1',
          name: 'Post',
          attributes: [
            {
              id: 'attr_1',
              name: 'views',
              type: 'Int',
              visibility: 'private',
              isPrimary: false,
              isNullable: true,
              isUnique: false,
            },
            {
              id: 'attr_2',
              name: 'rating',
              type: 'Float',
              visibility: 'private',
              isPrimary: false,
              isNullable: true,
              isUnique: false,
            },
            {
              id: 'attr_3',
              name: 'metadata',
              type: 'JSON',
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
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
      },
    };

    const generator = new PrismaGenerator();
    const code = await generator.generate(schema);

    assert.ok(code.includes('Int'));
    assert.ok(code.includes('Float'));
    assert.ok(code.includes('Json'));
  });

  test('should generate relations correctly', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'entity_1',
          name: 'User',
          attributes: [
            { id: 'attr_1', name: 'id', type: 'String', visibility: 'private', isPrimary: true, isNullable: false, isUnique: true },
            { id: 'attr_2', name: 'name', type: 'String', visibility: 'private', isPrimary: false, isNullable: false, isUnique: false },
          ],
          position: { x: 0, y: 0 },
        },
        {
          id: 'entity_2',
          name: 'Post',
          attributes: [
            { id: 'attr_3', name: 'id', type: 'String', visibility: 'private', isPrimary: true, isNullable: false, isUnique: true },
            { id: 'attr_4', name: 'title', type: 'String', visibility: 'private', isPrimary: false, isNullable: false, isUnique: false },
          ],
          position: { x: 300, y: 0 },
        },
      ],
      relations: [
        {
          id: 'rel_1',
          sourceClassId: 'entity_1',
          targetClassId: 'entity_2',
          type: 'OneToMany',
          umlType: 'association',
          sourceFieldName: 'posts',
        },
      ],
      config: {
        targetLanguage: 'TypeScript',
        orm: 'Prisma',
      },
    };

    const generator = new PrismaGenerator();
    const code = await generator.generate(schema);

    assert.ok(code.includes('model User'));
    assert.ok(code.includes('model Post'));
    assert.ok(code.includes('Post[]'));
    assert.ok(code.includes('@relation'));
  });
});
