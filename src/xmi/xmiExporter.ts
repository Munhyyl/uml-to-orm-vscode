/**
 * XMI 2.5.1 Exporter
 *
 * Serializes a UML Model (from umlMetamodel.ts) to OMG XMI 2.5.1 format.
 * Compatible with Enterprise Architect, StarUML, MagicDraw, Papyrus.
 *
 * XMI Spec: OMG formal/2015-06-07
 * UML Spec: OMG formal/2017-12-05
 */

import {
  UMLModel, UMLClass, UMLProperty, UMLOperation, UMLParameter,
  UMLAssociation, UMLGeneralization, UMLDependency, UMLDiagram,
  multiplicityToString,
} from '../types/umlMetamodel';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportToXMI(model: UMLModel, diagram?: UMLDiagram): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<xmi:XMI');
  lines.push('  xmi:version="2.5.1"');
  lines.push('  xmlns:xmi="http://www.omg.org/spec/XMI/20131001"');
  lines.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  lines.push('  xmlns:uml="http://www.omg.org/spec/UML/20161101">');
  lines.push('');

  // UML Model
  lines.push(`  <uml:Model xmi:id="${escapeXml(model.xmiId)}" name="${escapeXml(model.name)}">`);

  for (const element of model.packagedElements) {
    if ('ownedAttributes' in element && 'ownedOperations' in element) {
      serializeClass(element as UMLClass, lines, 4);
    } else if (element.xmiType === 'uml:Association') {
      serializeAssociation(element as UMLAssociation, lines, 4);
    } else if (element.xmiType === 'uml:Generalization') {
      serializeGeneralization(element as UMLGeneralization, lines, 4);
    } else if (
      element.xmiType === 'uml:Dependency' ||
      element.xmiType === 'uml:Realization'
    ) {
      serializeDependency(element as UMLDependency, lines, 4);
    }
  }

  lines.push('  </uml:Model>');

  // Diagram Interchange (optional)
  if (diagram) {
    lines.push('');
    lines.push('  <!-- Diagram Layout Information -->');
    lines.push(`  <diagram xmi:id="${escapeXml(diagram.xmiId)}" name="${escapeXml(diagram.name)}">`);
    for (const el of diagram.diagramElements) {
      lines.push(`    <diagramElement xmi:id="${escapeXml(el.xmiId)}" modelElement="${escapeXml(el.modelElementRef)}">`);
      lines.push(`      <bounds x="${el.bounds.x}" y="${el.bounds.y}" width="${el.bounds.width}" height="${el.bounds.height}"/>`);
      lines.push('    </diagramElement>');
    }
    lines.push('  </diagram>');
  }

  lines.push('');
  lines.push('</xmi:XMI>');

  return lines.join('\n');
}

function indent(level: number): string {
  return ' '.repeat(level);
}

function serializeClass(cls: UMLClass, lines: string[], depth: number): void {
  const pad = indent(depth);
  const attrs: string[] = [
    `xmi:type="${cls.xmiType}"`,
    `xmi:id="${escapeXml(cls.xmiId)}"`,
    `name="${escapeXml(cls.name)}"`,
    `visibility="${cls.visibility}"`,
  ];
  if (cls.isAbstract) attrs.push('isAbstract="true"');

  const hasChildren = cls.ownedAttributes.length > 0 || cls.ownedOperations.length > 0;

  if (!hasChildren) {
    lines.push(`${pad}<packagedElement ${attrs.join(' ')}/>`);
    return;
  }

  lines.push(`${pad}<packagedElement ${attrs.join(' ')}>`);

  // Documentation
  if (cls.documentation) {
    lines.push(`${pad}  <ownedComment xmi:id="${cls.xmiId}_doc">`);
    lines.push(`${pad}    <body>${escapeXml(cls.documentation)}</body>`);
    lines.push(`${pad}  </ownedComment>`);
  }

  // Stereotypes
  for (const stereo of cls.appliedStereotypes) {
    lines.push(`${pad}  <!-- stereotype: ${escapeXml(stereo)} -->`);
  }

  // Attributes
  for (const prop of cls.ownedAttributes) {
    serializeProperty(prop, lines, depth + 2);
  }

  // Operations
  for (const op of cls.ownedOperations) {
    serializeOperation(op, lines, depth + 2);
  }

  // Enumeration literals
  if (cls.ownedLiterals) {
    for (const lit of cls.ownedLiterals) {
      lines.push(`${pad}  <ownedLiteral xmi:type="uml:EnumerationLiteral" xmi:id="${escapeXml(lit.xmiId)}" name="${escapeXml(lit.name)}"/>`);
    }
  }

  lines.push(`${pad}</packagedElement>`);
}

function serializeProperty(prop: UMLProperty, lines: string[], depth: number): void {
  const pad = indent(depth);
  const attrs: string[] = [
    'xmi:type="uml:Property"',
    `xmi:id="${escapeXml(prop.xmiId)}"`,
    `name="${escapeXml(prop.name)}"`,
    `visibility="${prop.visibility}"`,
  ];
  if (prop.isStatic) attrs.push('isStatic="true"');
  if (prop.isReadOnly) attrs.push('isReadOnly="true"');
  if (prop.isDerived) attrs.push('isDerived="true"');
  if (prop.isId) attrs.push('isID="true"');
  if (prop.isUnique) attrs.push('isUnique="true"');
  if (prop.aggregation !== 'none') attrs.push(`aggregation="${prop.aggregation}"`);

  lines.push(`${pad}<ownedAttribute ${attrs.join(' ')}>`);

  // Type reference
  lines.push(`${pad}  <type xmi:type="uml:PrimitiveType" href="pathmap://UML_LIBRARIES/UMLPrimitiveTypes.library.uml#${escapeXml(prop.type)}"/>`);

  // Multiplicity
  const multStr = multiplicityToString(prop.multiplicity);
  if (multStr !== '1') {
    lines.push(`${pad}  <lowerValue xmi:type="uml:LiteralInteger" value="${prop.multiplicity.lower}"/>`);
    const upperVal = prop.multiplicity.upper === -1 ? '*' : String(prop.multiplicity.upper);
    lines.push(`${pad}  <upperValue xmi:type="uml:LiteralUnlimitedNatural" value="${upperVal}"/>`);
  }

  // Default value
  if (prop.defaultValue !== undefined && prop.defaultValue !== '') {
    lines.push(`${pad}  <defaultValue xmi:type="uml:LiteralString" value="${escapeXml(prop.defaultValue)}"/>`);
  }

  // Constraints (ORM extensions)
  if (prop.constraints) {
    for (const c of prop.constraints) {
      lines.push(`${pad}  <!-- constraint: ${c.kind} -->`);
    }
  }

  lines.push(`${pad}</ownedAttribute>`);
}

function serializeOperation(op: UMLOperation, lines: string[], depth: number): void {
  const pad = indent(depth);
  const attrs: string[] = [
    'xmi:type="uml:Operation"',
    `xmi:id="${escapeXml(op.xmiId)}"`,
    `name="${escapeXml(op.name)}"`,
    `visibility="${op.visibility}"`,
  ];
  if (op.isStatic) attrs.push('isStatic="true"');
  if (op.isAbstract) attrs.push('isAbstract="true"');
  if (op.isQuery) attrs.push('isQuery="true"');

  if (op.ownedParameters.length === 0) {
    lines.push(`${pad}<ownedOperation ${attrs.join(' ')}/>`);
    return;
  }

  lines.push(`${pad}<ownedOperation ${attrs.join(' ')}>`);
  for (const param of op.ownedParameters) {
    serializeParameter(param, lines, depth + 2);
  }
  lines.push(`${pad}</ownedOperation>`);
}

function serializeParameter(param: UMLParameter, lines: string[], depth: number): void {
  const pad = indent(depth);
  const attrs: string[] = [
    'xmi:type="uml:Parameter"',
    `xmi:id="${escapeXml(param.xmiId)}"`,
    `name="${escapeXml(param.name)}"`,
    `direction="${param.direction}"`,
  ];

  lines.push(`${pad}<ownedParameter ${attrs.join(' ')}>`);
  lines.push(`${pad}  <type xmi:type="uml:PrimitiveType" href="pathmap://UML_LIBRARIES/UMLPrimitiveTypes.library.uml#${escapeXml(param.type)}"/>`);
  lines.push(`${pad}</ownedParameter>`);
}

function serializeAssociation(assoc: UMLAssociation, lines: string[], depth: number): void {
  const pad = indent(depth);
  const nameAttr = assoc.name ? ` name="${escapeXml(assoc.name)}"` : '';

  lines.push(`${pad}<packagedElement xmi:type="uml:Association" xmi:id="${escapeXml(assoc.xmiId)}"${nameAttr}>`);
  lines.push(`${pad}  <memberEnd xmi:idref="${escapeXml(assoc.memberEnds[0])}"/>`);
  lines.push(`${pad}  <memberEnd xmi:idref="${escapeXml(assoc.memberEnds[1])}"/>`);

  for (const end of assoc.ownedEnds) {
    serializeProperty(end, lines, depth + 2);
  }

  lines.push(`${pad}</packagedElement>`);
}

function serializeGeneralization(gen: UMLGeneralization, lines: string[], depth: number): void {
  const pad = indent(depth);
  lines.push(`${pad}<packagedElement xmi:type="uml:Generalization" xmi:id="${escapeXml(gen.xmiId)}" general="${escapeXml(gen.general)}" specific="${escapeXml(gen.specific)}"/>`);
}

function serializeDependency(dep: UMLDependency, lines: string[], depth: number): void {
  const pad = indent(depth);
  const nameAttr = dep.name ? ` name="${escapeXml(dep.name)}"` : '';
  lines.push(`${pad}<packagedElement xmi:type="${dep.xmiType}" xmi:id="${escapeXml(dep.xmiId)}"${nameAttr} client="${escapeXml(dep.client)}" supplier="${escapeXml(dep.supplier)}"/>`);
}
