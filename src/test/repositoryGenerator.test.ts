import * as assert from 'assert';
import { RepositoryGeneratorService } from '../generators/repositoryGeneratorService';
import { buildRepositoryFileName } from '../shared/ormCatalog';
import { ProjectSchema } from '../types/schema';

function createRepositorySchema(orm: ProjectSchema['config']['orm']): ProjectSchema {
  return {
    version: '1.0',
    entities: [
      {
        id: 'entity_user',
        name: 'User',
        attributes: [
          {
            id: 'attr_user_id',
            name: 'id',
            type: 'Int',
            visibility: 'private',
            isPrimary: true,
            isNullable: false,
            isUnique: true,
          },
          {
            id: 'attr_user_email',
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
      {
        id: 'entity_post',
        name: 'Post',
        attributes: [
          {
            id: 'attr_post_id',
            name: 'id',
            type: 'Int',
            visibility: 'private',
            isPrimary: true,
            isNullable: false,
            isUnique: true,
          },
        ],
        position: { x: 320, y: 0 },
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
      targetLanguage: orm === 'Hibernate' ? 'Java' : orm === 'SQLAlchemy' || orm === 'Django' ? 'Python' : 'TypeScript',
      orm,
      database: 'PostgreSQL',
      projectName: 'blog',
    },
  };
}

suite('Repository Generator', () => {
  test('builds repository file names per ORM language', () => {
    assert.strictEqual(buildRepositoryFileName('blog', 'Prisma', 'PostgreSQL'), 'blog_repository_postgresql.ts');
    assert.strictEqual(buildRepositoryFileName('blog', 'TypeORM', 'MySQL'), 'blog_repository_mysql.ts');
    assert.strictEqual(buildRepositoryFileName('blog', 'SQLAlchemy', 'PostgreSQL'), 'blog_repository_postgresql.py');
    assert.strictEqual(buildRepositoryFileName('blog', 'Hibernate', 'MySQL'), 'blog_repository_mysql.java');
  });

  test('rejects repository generation when schema has no eligible entities', async () => {
    const schema: ProjectSchema = {
      version: '1.0',
      entities: [
        {
          id: 'enum_status',
          name: 'Status',
          stereotype: 'enum',
          attributes: [],
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

    await assert.rejects(
      () => new RepositoryGeneratorService().generate(schema),
      /Schema has no repository-eligible entities/,
    );
  });

  test('rejects repository generation when schema validation fails', async () => {
    const schema = createRepositorySchema('Prisma');
    schema.config.targetLanguage = 'Java';

    await assert.rejects(
      () => new RepositoryGeneratorService().generate(schema),
      /not compatible with language/,
    );
  });

  test('Prisma repository emits CRUD methods and client imports', async () => {
    const code = await new RepositoryGeneratorService().generate(createRepositorySchema('Prisma'));

    assert.ok(code.includes(`import { Prisma, PrismaClient } from '@prisma/client';`));
    assert.ok(code.includes('class UserRepository'));
    assert.ok(code.includes('async create(data: Prisma.UserCreateInput)'));
    assert.ok(code.includes('return this.prisma.user.findUnique({ where: { id } });'));
    assert.ok(code.includes('Related entity access placeholder: posts'));
  });

  test('TypeORM repository uses DataSource.getRepository', async () => {
    const code = await new RepositoryGeneratorService().generate(createRepositorySchema('TypeORM'));

    assert.ok(code.includes(`import { DataSource, DeepPartial, Repository } from 'typeorm';`));
    assert.ok(code.includes(`import { User, Post } from './blog_typeorm_postgresql';`));
    assert.ok(code.includes('this.dataSource.getRepository(User)'));
    assert.ok(code.includes('async delete(id: number): Promise<boolean>'));
  });

  test('Hibernate repository extends JpaRepository with the entity primary key type', async () => {
    const code = await new RepositoryGeneratorService().generate(createRepositorySchema('Hibernate'));

    assert.ok(code.includes('package blog.repository;'));
    assert.ok(code.includes('import org.springframework.data.jpa.repository.JpaRepository;'));
    assert.ok(code.includes('public interface UserRepository extends JpaRepository<User, Integer>'));
  });

  test('SQLAlchemy repository uses Session-based CRUD helpers', async () => {
    const code = await new RepositoryGeneratorService().generate(createRepositorySchema('SQLAlchemy'));

    assert.ok(code.includes('from sqlalchemy.orm import Session'));
    assert.ok(code.includes('class UserRepository:'));
    assert.ok(code.includes('def create(self, session: Session, data: dict[str, Any]) -> User:'));
    assert.ok(code.includes('return session.query(User).all()'));
  });

  test('Django repository wraps Model.objects helpers', async () => {
    const code = await new RepositoryGeneratorService().generate(createRepositorySchema('Django'));

    assert.ok(code.includes('class UserRepository:'));
    assert.ok(code.includes('return User.objects.create(**data)'));
    assert.ok(code.includes('return User.objects.filter(id=id).first()'));
    assert.ok(code.includes('return User.objects.all()'));
  });
});
