import * as assert from 'assert';
import { PrismaGenerator } from '../generators/orm/prismaGenerator';
import { TypeORMGenerator } from '../generators/orm/typeORMGenerator';
import { DjangoGenerator } from '../generators/orm/djangoGenerator';
import { SQLAlchemyGenerator } from '../generators/orm/sqlalchemyGenerator';
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
});
