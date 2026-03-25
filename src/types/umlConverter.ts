/**
 * Bi-directional converter between ProjectSchema (IR) and UML Metamodel types.
 *
 * IR (schema.ts)  <-->  UML Metamodel (umlMetamodel.ts)  <-->  XMI
 *
 * This is the bridge layer: the IR is a simplified representation,
 * and we "lift" it to the formal UML metamodel for standards compliance,
 * then serialize to XMI.
 */

import {
  ProjectSchema, ClassEntity, Attribute, Method, Relation,
  Visibility, DataType, deriveRelationType,
} from './schema';
import {
  UMLModel, UMLClass, UMLProperty, UMLOperation, UMLParameter,
  UMLAssociation, UMLGeneralization, UMLDependency, UMLDiagram,
  DiagramElement, MultiplicityElement, Multiplicity,
  VisibilityKind, AggregationKind,
  toUMLPrimitiveType, fromUMLPrimitiveType,
  parseMultiplicityString, multiplicityToString,
} from './umlMetamodel';

// ─── IR --> UML Metamodel ────────────────────────────────────────────

export function projectSchemaToUMLModel(schema: ProjectSchema): { model: UMLModel; diagram: UMLDiagram } {
  const modelId = `model_${Date.now()}`;

  const classes: UMLClass[] = schema.entities.map((entity) => classEntityToUMLClass(entity));

  const associations: UMLAssociation[] = [];
  const generalizations: UMLGeneralization[] = [];
  const dependencies: UMLDependency[] = [];

  for (const relation of schema.relations) {
    if (relation.umlType === 'inheritance') {
      generalizations.push({
        xmiId: relation.id,
        xmiType: 'uml:Generalization',
        general: relation.targetClassId,
        specific: relation.sourceClassId,
      });
    } else if (relation.umlType === 'realization' || relation.umlType === 'dependency') {
      dependencies.push({
        xmiId: relation.id,
        xmiType: relation.umlType === 'realization' ? 'uml:Realization' : 'uml:Dependency',
        client: relation.sourceClassId,
        supplier: relation.targetClassId,
      });
    } else {
      // association, aggregation, composition --> UMLAssociation
      const aggregation = relationToAggregation(relation);
      const srcMultiplicity = parseMultiplicityString(relation.sourceMultiplicity || '1');
      const tgtMultiplicity = parseMultiplicityString(relation.targetMultiplicity || '*');

      const srcEndId = `${relation.id}_srcEnd`;
      const tgtEndId = `${relation.id}_tgtEnd`;

      associations.push({
        xmiId: relation.id,
        xmiType: 'uml:Association',
        name: relation.sourceFieldName || undefined,
        memberEnds: [srcEndId, tgtEndId],
        ownedEnds: [
          {
            xmiId: srcEndId,
            name: relation.sourceFieldName || '',
            type: relation.sourceClassId,
            visibility: 'public',
            isStatic: false,
            isReadOnly: false,
            isDerived: false,
            isId: false,
            isUnique: true,
            multiplicity: srcMultiplicity,
            aggregation: 'none',
          },
          {
            xmiId: tgtEndId,
            name: relation.targetFieldName || '',
            type: relation.targetClassId,
            visibility: 'public',
            isStatic: false,
            isReadOnly: false,
            isDerived: false,
            isId: false,
            isUnique: true,
            multiplicity: tgtMultiplicity,
            aggregation,
          },
        ],
        isDerived: false,
      });
    }
  }

  const model: UMLModel = {
    xmiId: modelId,
    xmiType: 'uml:Model',
    xmiVersion: '2.5.1',
    name: schema.config.projectName || 'UMLModel',
    packagedElements: [...classes, ...associations, ...generalizations, ...dependencies],
  };

  // Diagram layout info
  const diagram: UMLDiagram = {
    xmiId: `diagram_${Date.now()}`,
    name: 'Class Diagram',
    diagramElements: schema.entities.map((entity) => ({
      xmiId: `di_${entity.id}`,
      modelElementRef: entity.id,
      bounds: {
        x: entity.position.x,
        y: entity.position.y,
        width: 220,
        height: 100 + entity.attributes.length * 20 + (entity.methods?.length || 0) * 20,
      },
    })),
  };

  return { model, diagram };
}

function classEntityToUMLClass(entity: ClassEntity): UMLClass {
  const xmiType = stereotypeToXmiType(entity.stereotype);

  return {
    xmiId: entity.id,
    xmiType,
    name: entity.name,
    visibility: 'public',
    isAbstract: entity.stereotype === 'abstract',
    isActive: false,
    ownedAttributes: entity.attributes.map((attr) => attributeToUMLProperty(attr)),
    ownedOperations: (entity.methods || []).map((method) => methodToUMLOperation(method)),
    appliedStereotypes: entity.stereotype ? [entity.stereotype] : [],
    documentation: entity.documentation,
  };
}

function stereotypeToXmiType(stereotype?: string): UMLClass['xmiType'] {
  switch (stereotype) {
    case 'interface': return 'uml:Interface';
    case 'enum':      return 'uml:Enumeration';
    case 'dataType':  return 'uml:DataType';
    default:          return 'uml:Class';
  }
}

function attributeToUMLProperty(attr: Attribute): UMLProperty {
  const constraints: UMLProperty['constraints'] = [];
  if (attr.isPrimary)  constraints.push({ kind: 'primaryKey' });
  if (attr.isUnique)   constraints.push({ kind: 'unique' });
  if (!attr.isNullable) constraints.push({ kind: 'notNull' });

  return {
    xmiId: attr.id,
    name: attr.name,
    type: toUMLPrimitiveType(attr.type),
    visibility: attr.visibility || 'private',
    isStatic: attr.isStatic || false,
    isReadOnly: false,
    isDerived: false,
    isId: attr.isPrimary,
    isUnique: attr.isUnique,
    multiplicity: attr.isNullable ? Multiplicity.ZERO_OR_ONE : Multiplicity.ONE,
    defaultValue: attr.defaultValue,
    aggregation: 'none',
    constraints: constraints.length > 0 ? constraints : undefined,
  };
}

function methodToUMLOperation(method: Method): UMLOperation {
  const params: UMLParameter[] = method.parameters.map((p, i) => ({
    xmiId: `${method.id}_param_${i}`,
    name: p.name,
    type: toUMLPrimitiveType(p.type),
    direction: 'in' as const,
  }));

  // Add return parameter
  if (method.returnType && method.returnType !== 'void') {
    params.push({
      xmiId: `${method.id}_return`,
      name: 'return',
      type: toUMLPrimitiveType(method.returnType),
      direction: 'return' as const,
    });
  }

  return {
    xmiId: method.id,
    name: method.name,
    visibility: method.visibility || 'public',
    isStatic: method.isStatic || false,
    isAbstract: method.isAbstract || false,
    isQuery: false,
    ownedParameters: params,
  };
}

function relationToAggregation(relation: Relation): AggregationKind {
  switch (relation.umlType) {
    case 'aggregation': return 'shared';
    case 'composition': return 'composite';
    default:            return 'none';
  }
}

// ─── UML Metamodel --> IR ────────────────────────────────────────────

export function umlModelToProjectSchema(
  model: UMLModel,
  diagram?: UMLDiagram,
  config?: { targetLanguage: string; orm: string }
): ProjectSchema {
  const entities: ClassEntity[] = [];
  const relations: Relation[] = [];

  for (const element of model.packagedElements) {
    if ('ownedAttributes' in element && 'ownedOperations' in element) {
      const umlClass = element as UMLClass;
      const diagramEl = diagram?.diagramElements.find((d) => d.modelElementRef === umlClass.xmiId);
      entities.push(umlClassToClassEntity(umlClass, diagramEl));
    } else if (element.xmiType === 'uml:Association') {
      const assoc = element as UMLAssociation;
      relations.push(umlAssociationToRelation(assoc));
    } else if (element.xmiType === 'uml:Generalization') {
      const gen = element as UMLGeneralization;
      relations.push({
        id: gen.xmiId,
        sourceClassId: gen.specific,
        targetClassId: gen.general,
        type: deriveRelationType('inheritance') || 'OneToOne',
        umlType: 'inheritance',
      });
    } else if (
      (element as UMLDependency).xmiType === 'uml:Dependency' ||
      (element as UMLDependency).xmiType === 'uml:Realization'
    ) {
      const dep = element as UMLDependency;
      relations.push({
        id: dep.xmiId,
        sourceClassId: dep.client,
        targetClassId: dep.supplier,
        type: deriveRelationType(dep.xmiType === 'uml:Realization' ? 'realization' : 'dependency') || 'OneToOne',
        umlType: dep.xmiType === 'uml:Realization' ? 'realization' : 'dependency',
      });
    }
  }

  return {
    version: '1.0',
    entities,
    relations,
    config: {
      targetLanguage: (config?.targetLanguage || 'TypeScript') as any,
      orm: (config?.orm || 'Prisma') as any,
      projectName: model.name,
    },
  };
}

function umlClassToClassEntity(umlClass: UMLClass, diagramEl?: DiagramElement): ClassEntity {
  return {
    id: umlClass.xmiId,
    name: umlClass.name,
    stereotype: xmiTypeToStereotype(umlClass),
    attributes: umlClass.ownedAttributes.map((prop) => umlPropertyToAttribute(prop)),
    methods: umlClass.ownedOperations.map((op) => umlOperationToMethod(op)),
    documentation: umlClass.documentation,
    position: diagramEl
      ? { x: diagramEl.bounds.x, y: diagramEl.bounds.y }
      : { x: Math.random() * 600, y: Math.random() * 400 },
  };
}

function xmiTypeToStereotype(umlClass: UMLClass): string {
  if (umlClass.xmiType === 'uml:Interface')   return 'interface';
  if (umlClass.xmiType === 'uml:Enumeration') return 'enum';
  if (umlClass.xmiType === 'uml:DataType')    return 'dataType';
  if (umlClass.isAbstract) return 'abstract';
  if (umlClass.appliedStereotypes.length > 0)  return umlClass.appliedStereotypes[0];
  return 'entity';
}

function umlPropertyToAttribute(prop: UMLProperty): Attribute {
  return {
    id: prop.xmiId,
    name: prop.name,
    type: fromUMLPrimitiveType(prop.type) as DataType,
    visibility: prop.visibility as Visibility,
    isPrimary: prop.isId || (prop.constraints?.some((c) => c.kind === 'primaryKey') ?? false),
    isNullable: prop.multiplicity.lower === 0,
    isUnique: prop.isUnique || (prop.constraints?.some((c) => c.kind === 'unique') ?? false),
    isStatic: prop.isStatic,
    defaultValue: prop.defaultValue,
  };
}

function umlOperationToMethod(op: UMLOperation): Method {
  const returnParam = op.ownedParameters.find((p) => p.direction === 'return');
  const inputParams = op.ownedParameters.filter((p) => p.direction !== 'return');

  return {
    id: op.xmiId,
    name: op.name,
    returnType: returnParam ? fromUMLPrimitiveType(returnParam.type) : 'void',
    visibility: op.visibility as Visibility,
    parameters: inputParams.map((p) => ({ name: p.name, type: fromUMLPrimitiveType(p.type) })),
    isStatic: op.isStatic,
    isAbstract: op.isAbstract,
  };
}

function umlAssociationToRelation(assoc: UMLAssociation): Relation {
  const srcEnd = assoc.ownedEnds[0];
  const tgtEnd = assoc.ownedEnds[1];

  // Determine UML type from aggregation
  let umlType: Relation['umlType'] = 'association';
  const aggregation = tgtEnd?.aggregation || srcEnd?.aggregation;
  if (aggregation === 'shared')    umlType = 'aggregation';
  else if (aggregation === 'composite') umlType = 'composition';

  const sourceMultiplicity = srcEnd ? multiplicityToString(srcEnd.multiplicity) : '1';
  const targetMultiplicity = tgtEnd ? multiplicityToString(tgtEnd.multiplicity) : '*';
  const relationType = deriveRelationType(umlType, sourceMultiplicity, targetMultiplicity) || 'OneToOne';

  return {
    id: assoc.xmiId,
    sourceClassId: srcEnd?.type || '',
    targetClassId: tgtEnd?.type || '',
    type: relationType,
    umlType,
    sourceMultiplicity,
    targetMultiplicity,
    sourceFieldName: srcEnd?.name,
    targetFieldName: tgtEnd?.name,
  };
}
