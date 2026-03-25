import * as assert from 'assert';
import { ProjectSchema } from '../types/schema';
import { projectSchemaToUMLModel } from '../types/umlConverter';
import { exportToXMI } from '../xmi/xmiExporter';
import { importFromXMI } from '../xmi/xmiImporter';

function normalizeSchema(schema: ProjectSchema) {
  const entities = schema.entities
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      stereotype: entity.stereotype || 'entity',
      position: entity.position,
      attributes: entity.attributes
        .map((attribute) => ({
          id: attribute.id,
          name: attribute.name,
          type: attribute.type,
          visibility: attribute.visibility,
          isPrimary: attribute.isPrimary,
          isNullable: attribute.isNullable,
          isUnique: attribute.isUnique,
          isStatic: Boolean(attribute.isStatic),
          defaultValue: attribute.defaultValue || '',
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      methods: (entity.methods || [])
        .map((method) => ({
          id: method.id,
          name: method.name,
          returnType: method.returnType,
          visibility: method.visibility,
          isStatic: Boolean(method.isStatic),
          isAbstract: Boolean(method.isAbstract),
          parameters: method.parameters.map((parameter) => ({
            name: parameter.name,
            type: parameter.type,
          })),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const relations = schema.relations
    .map((relation) => ({
      id: relation.id,
      sourceClassId: relation.sourceClassId,
      targetClassId: relation.targetClassId,
      type: relation.type,
      umlType: relation.umlType,
      sourceMultiplicity: relation.sourceMultiplicity || '',
      targetMultiplicity: relation.targetMultiplicity || '',
      sourceFieldName: relation.sourceFieldName || '',
      targetFieldName: relation.targetFieldName || '',
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    version: schema.version,
    projectName: schema.config.projectName || '',
    entities,
    relations,
  };
}

suite('XMI Round-Trip', () => {
  const sourceSchema: ProjectSchema = {
    version: '1.0',
    entities: [
      {
        id: 'entity_user',
        name: 'User',
        stereotype: 'entity',
        attributes: [
          {
            id: 'attr_user_id',
            name: 'id',
            type: 'String',
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
            defaultValue: 'example@demo.com',
          },
        ],
        methods: [
          {
            id: 'method_user_activate',
            name: 'activate',
            returnType: 'Boolean',
            visibility: 'public',
            parameters: [{ name: 'token', type: 'String' }],
          },
        ],
        position: { x: 120, y: 80 },
      },
      {
        id: 'entity_post',
        name: 'Post',
        stereotype: 'entity',
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
          {
            id: 'attr_post_title',
            name: 'title',
            type: 'String',
            visibility: 'private',
            isPrimary: false,
            isNullable: false,
            isUnique: false,
          },
        ],
        methods: [],
        position: { x: 520, y: 80 },
      },
      {
        id: 'entity_audit',
        name: 'AuditLog',
        stereotype: 'abstract',
        attributes: [
          {
            id: 'attr_audit_createdAt',
            name: 'createdAt',
            type: 'DateTime',
            visibility: 'protected',
            isPrimary: false,
            isNullable: false,
            isUnique: false,
          },
        ],
        methods: [
          {
            id: 'method_audit_format',
            name: 'format',
            returnType: 'String',
            visibility: 'public',
            parameters: [],
            isAbstract: true,
          },
        ],
        position: { x: 320, y: 320 },
      },
    ],
    relations: [
      {
        id: 'rel_user_posts',
        sourceClassId: 'entity_user',
        targetClassId: 'entity_post',
        type: 'OneToMany',
        umlType: 'association',
        sourceMultiplicity: '1',
        targetMultiplicity: '*',
        sourceFieldName: 'posts',
        targetFieldName: 'author',
      },
      {
        id: 'rel_post_audit',
        sourceClassId: 'entity_post',
        targetClassId: 'entity_audit',
        type: 'OneToOne',
        umlType: 'inheritance',
      },
      {
        id: 'rel_user_audit_dep',
        sourceClassId: 'entity_user',
        targetClassId: 'entity_audit',
        type: 'OneToOne',
        umlType: 'dependency',
      },
    ],
    config: {
      targetLanguage: 'TypeScript',
      orm: 'Prisma',
      projectName: 'RoundTripModel',
    },
  };

  test('preserves core schema invariants after export/import', () => {
    const { model, diagram } = projectSchemaToUMLModel(sourceSchema);
    const xmi = exportToXMI(model, diagram);
    const imported = importFromXMI(xmi);

    assert.deepStrictEqual(normalizeSchema(imported), normalizeSchema(sourceSchema));
  });

  test('is stable across repeated XMI round-trips', () => {
    const first = importFromXMI(exportToXMI(projectSchemaToUMLModel(sourceSchema).model, projectSchemaToUMLModel(sourceSchema).diagram));
    const second = importFromXMI(exportToXMI(projectSchemaToUMLModel(first).model, projectSchemaToUMLModel(first).diagram));

    assert.deepStrictEqual(normalizeSchema(second), normalizeSchema(first));
  });

  test('escapes and restores XML special characters', () => {
    const schemaWithSpecials: ProjectSchema = {
      ...sourceSchema,
      entities: [
        {
          ...sourceSchema.entities[0],
          name: 'User & Admin <Root> "A"',
          attributes: [
            {
              ...sourceSchema.entities[0].attributes[0],
              name: 'id & key',
              defaultValue: '"quoted" & <xml>',
            },
          ],
        },
      ],
      relations: [],
      config: { ...sourceSchema.config, projectName: 'Model & Meta <XMI>' },
    };

    const { model, diagram } = projectSchemaToUMLModel(schemaWithSpecials);
    const xmi = exportToXMI(model, diagram);
    const imported = importFromXMI(xmi);

    assert.strictEqual(imported.config.projectName, 'Model & Meta <XMI>');
    assert.strictEqual(imported.entities[0].name, 'User & Admin <Root> "A"');
    assert.strictEqual(imported.entities[0].attributes[0].name, 'id & key');
    assert.strictEqual(imported.entities[0].attributes[0].defaultValue, '"quoted" & <xml>');
  });
});
