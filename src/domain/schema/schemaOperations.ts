import {
  Attribute,
  ClassEntity,
  DataType,
  Method,
  OnDeleteAction,
  ProjectSchema,
  Relation,
  UmlRelationType,
  Visibility,
  deriveRelationType,
} from '../../types/schema';

export function createEmptySchema(projectName?: string): ProjectSchema {
  return {
    version: '1.0',
    entities: [],
    relations: [],
    config: {
      targetLanguage: 'TypeScript',
      orm: 'Prisma',
      projectName,
    },
  };
}

export function isDataRelation(umlType: UmlRelationType): boolean {
  return !['inheritance', 'realization', 'dependency'].includes(umlType);
}

export function resolveOnDelete(relation: Relation): OnDeleteAction | undefined {
  if (!isDataRelation(relation.umlType)) {
    return undefined;
  }
  if (relation.umlType === 'composition') {
    return 'Cascade';
  }
  return relation.onDelete;
}

export function createEntity(name: string, position: { x: number; y: number }): ClassEntity {
  return {
    id: `entity_${Date.now()}`,
    name,
    stereotype: 'entity',
    attributes: [],
    methods: [],
    position,
  };
}

export function createAttribute(name = 'newField', type: DataType = 'String', visibility: Visibility = 'private'): Attribute {
  return {
    id: `attr_${Date.now()}`,
    name,
    type,
    visibility,
    isPrimary: false,
    isNullable: true,
    isUnique: false,
  };
}

export function createMethod(name = 'newMethod', visibility: Visibility = 'public', returnType = 'void'): Method {
  return {
    id: `method_${Date.now()}`,
    name,
    returnType,
    visibility,
    parameters: [],
  };
}

export function createRelation(sourceClassId: string, targetClassId: string, umlType: UmlRelationType = 'association'): Relation {
  const sourceMultiplicity = isDataRelation(umlType) ? '1' : undefined;
  const targetMultiplicity = isDataRelation(umlType) ? '*' : undefined;
  return {
    id: `relation_${Date.now()}`,
    sourceClassId,
    targetClassId,
    type: deriveRelationType(umlType, sourceMultiplicity, targetMultiplicity) || 'OneToOne',
    umlType,
    sourceMultiplicity,
    targetMultiplicity,
  };
}

export function removeEntities(schema: ProjectSchema, entityIds: string[]): ProjectSchema {
  if (entityIds.length === 0) return schema;
  const idSet = new Set(entityIds);
  return {
    ...schema,
    entities: schema.entities.filter((entity) => !idSet.has(entity.id)),
    relations: schema.relations.filter(
      (relation) => !idSet.has(relation.sourceClassId) && !idSet.has(relation.targetClassId)
    ),
  };
}

export function removeRelations(schema: ProjectSchema, relationIds: string[]): ProjectSchema {
  if (relationIds.length === 0) return schema;
  const idSet = new Set(relationIds);
  return {
    ...schema,
    relations: schema.relations.filter((relation) => !idSet.has(relation.id)),
  };
}

export function upsertEntity(schema: ProjectSchema, entity: ClassEntity): ProjectSchema {
  const exists = schema.entities.some((item) => item.id === entity.id);
  if (!exists) {
    return {
      ...schema,
      entities: [...schema.entities, entity],
    };
  }
  return {
    ...schema,
    entities: schema.entities.map((item) => (item.id === entity.id ? entity : item)),
  };
}

export function upsertRelation(schema: ProjectSchema, relation: Relation): ProjectSchema {
  const exists = schema.relations.some((item) => item.id === relation.id);
  if (!exists) {
    return {
      ...schema,
      relations: [...schema.relations, relation],
    };
  }
  return {
    ...schema,
    relations: schema.relations.map((item) => (item.id === relation.id ? relation : item)),
  };
}
