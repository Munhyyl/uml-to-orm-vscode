/**
 * XMI 2.5.1 Importer
 *
 * Parses XMI files into UML Metamodel types, then converts to ProjectSchema (IR).
 * Supports XMI exported from Enterprise Architect, StarUML, MagicDraw, Papyrus.
 *
 * Uses a lightweight string-based XML parser for Node.js (VS Code extension host).
 */

import {
  UMLModel, UMLClass, UMLProperty, UMLOperation, UMLParameter,
  UMLAssociation, UMLGeneralization, UMLDependency,
  UMLDiagram, DiagramElement,
  Multiplicity, MultiplicityElement, VisibilityKind, AggregationKind,
} from '../types/umlMetamodel';
import { umlModelToProjectSchema } from '../types/umlConverter';
import { ProjectSchema } from '../types/schema';

// ─── Simple XML Element Representation ──────────────────────────────
interface XmlElement {
  tag: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

// ─── Public API ─────────────────────────────────────────────────────

export function importFromXMI(xmiContent: string): ProjectSchema {
  const root = parseXml(xmiContent);
  const modelEl = findElement(root, 'uml:Model') || findElement(root, 'Model');

  if (!modelEl) {
    throw new Error('No <uml:Model> element found in XMI file');
  }

  const model = parseUMLModel(modelEl);
  const diagramEl = findElement(root, 'diagram');
  const diagram = diagramEl ? parseDiagram(diagramEl) : undefined;

  return umlModelToProjectSchema(model, diagram);
}

// ─── XML Parser (lightweight, for Node.js environment) ──────────────

function parseXml(xml: string): XmlElement {
  // Remove XML declaration and comments
  xml = xml.replace(/<\?xml[^?]*\?>/g, '');
  xml = xml.replace(/<!--[\s\S]*?-->/g, '');
  xml = xml.trim();

  return parseElement(xml, 0).element;
}

function parseElement(xml: string, pos: number): { element: XmlElement; endPos: number } {
  // Skip whitespace
  while (pos < xml.length && /\s/.test(xml[pos])) pos++;

  if (pos >= xml.length || xml[pos] !== '<') {
    return {
      element: { tag: '', attributes: {}, children: [], text: xml.substring(pos).trim() },
      endPos: xml.length,
    };
  }

  pos++; // skip '<'

  // Get tag name
  let tagName = '';
  while (pos < xml.length && !/[\s/>]/.test(xml[pos])) {
    tagName += xml[pos];
    pos++;
  }

  // Parse attributes
  const attributes: Record<string, string> = {};
  while (pos < xml.length) {
    while (pos < xml.length && /\s/.test(xml[pos])) pos++;

    if (xml[pos] === '/' && xml[pos + 1] === '>') {
      // Self-closing tag
      return {
        element: { tag: tagName, attributes, children: [], text: '' },
        endPos: pos + 2,
      };
    }

    if (xml[pos] === '>') {
      pos++; // skip '>'
      break;
    }

    // Parse attribute name
    let attrName = '';
    while (pos < xml.length && !/[\s=]/.test(xml[pos])) {
      attrName += xml[pos];
      pos++;
    }
    while (pos < xml.length && /\s/.test(xml[pos])) pos++;

    if (xml[pos] === '=') {
      pos++; // skip '='
      while (pos < xml.length && /\s/.test(xml[pos])) pos++;

      const quote = xml[pos];
      pos++; // skip opening quote
      let attrValue = '';
      while (pos < xml.length && xml[pos] !== quote) {
        if (xml[pos] === '&') {
          const semi = xml.indexOf(';', pos);
          if (semi !== -1) {
            const entity = xml.substring(pos, semi + 1);
            attrValue += unescapeXml(entity);
            pos = semi + 1;
          } else {
            attrValue += xml[pos];
            pos++;
          }
        } else {
          attrValue += xml[pos];
          pos++;
        }
      }
      pos++; // skip closing quote
      if (attrName) {
        attributes[attrName] = attrValue;
      }
    }
  }

  // Parse children and text content
  const children: XmlElement[] = [];
  let textContent = '';
  const closingTag = `</${tagName}>`;

  while (pos < xml.length) {
    while (pos < xml.length && /\s/.test(xml[pos])) pos++;

    if (pos >= xml.length) break;

    // Check for closing tag
    if (xml.substring(pos, pos + closingTag.length) === closingTag) {
      return {
        element: { tag: tagName, attributes, children, text: textContent.trim() },
        endPos: pos + closingTag.length,
      };
    }

    // Check for child element
    if (xml[pos] === '<' && xml[pos + 1] !== '/') {
      const result = parseElement(xml, pos);
      children.push(result.element);
      pos = result.endPos;
    } else if (xml[pos] === '<' && xml[pos + 1] === '/') {
      // Closing tag for current element
      const end = xml.indexOf('>', pos);
      return {
        element: { tag: tagName, attributes, children, text: textContent.trim() },
        endPos: end + 1,
      };
    } else {
      // Text content
      while (pos < xml.length && xml[pos] !== '<') {
        textContent += xml[pos];
        pos++;
      }
    }
  }

  return {
    element: { tag: tagName, attributes, children, text: textContent.trim() },
    endPos: pos,
  };
}

function unescapeXml(entity: string): string {
  const map: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  };
  return map[entity] || entity;
}

function findElement(el: XmlElement, tagName: string): XmlElement | undefined {
  if (el.tag === tagName) return el;
  for (const child of el.children) {
    const found = findElement(child, tagName);
    if (found) return found;
  }
  return undefined;
}

function findElements(el: XmlElement, tagName: string): XmlElement[] {
  const results: XmlElement[] = [];
  for (const child of el.children) {
    if (child.tag === tagName) results.push(child);
  }
  return results;
}

function attr(el: XmlElement | undefined, name: string, defaultValue: string = ''): string {
  if (!el) return defaultValue;
  return el.attributes[name] || el.attributes[`xmi:${name}`] || defaultValue;
}

// ─── UML Model Parsing ──────────────────────────────────────────────

function parseUMLModel(el: XmlElement): UMLModel {
  const packagedElements = parsePackagedElements(el);

  return {
    xmiId: attr(el, 'xmi:id', attr(el, 'id', `model_${Date.now()}`)),
    xmiType: 'uml:Model',
    xmiVersion: '2.5.1',
    name: attr(el, 'name', 'ImportedModel'),
    packagedElements,
  };
}

function parsePackagedElements(parent: XmlElement): UMLModel['packagedElements'] {
  const elements: UMLModel['packagedElements'] = [];
  const packagedEls = findElements(parent, 'packagedElement');

  for (const el of packagedEls) {
    const xmiType = attr(el, 'xmi:type', attr(el, 'type', ''));

    switch (xmiType) {
      case 'uml:Class':
      case 'uml:Interface':
      case 'uml:Enumeration':
      case 'uml:DataType':
        elements.push(parseClass(el, xmiType as UMLClass['xmiType']));
        break;
      case 'uml:Association':
        elements.push(parseAssociation(el));
        break;
      case 'uml:Generalization':
        elements.push(parseGeneralization(el));
        break;
      case 'uml:Dependency':
      case 'uml:Realization':
        elements.push(parseDependency(el, xmiType as UMLDependency['xmiType']));
        break;
      case 'uml:Package': {
        // Recursively parse nested packages (flatten into root)
        const nested = parsePackagedElements(el);
        elements.push(...nested);
        break;
      }
    }
  }

  return elements;
}

function parseClass(el: XmlElement, xmiType: UMLClass['xmiType']): UMLClass {
  const ownedAttributes = findElements(el, 'ownedAttribute').map(parseProperty);
  const ownedOperations = findElements(el, 'ownedOperation').map(parseOperation);

  const stereotypes: string[] = [];
  if (xmiType === 'uml:Interface') stereotypes.push('interface');
  else if (xmiType === 'uml:Enumeration') stereotypes.push('enum');
  else if (attr(el, 'isAbstract') === 'true') stereotypes.push('abstract');

  let documentation: string | undefined;
  const commentEl = findElement(el, 'ownedComment');
  if (commentEl) {
    const bodyEl = findElement(commentEl, 'body');
    documentation = bodyEl?.text || commentEl.attributes['body'];
  }

  return {
    xmiId: attr(el, 'xmi:id', attr(el, 'id', `class_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)),
    xmiType,
    name: attr(el, 'name', 'UnnamedClass'),
    visibility: (attr(el, 'visibility', 'public') as VisibilityKind),
    isAbstract: attr(el, 'isAbstract') === 'true',
    isActive: attr(el, 'isActive') === 'true',
    ownedAttributes,
    ownedOperations,
    appliedStereotypes: stereotypes,
    documentation,
  };
}

function parseProperty(el: XmlElement): UMLProperty {
  const typeEl = findElement(el, 'type');
  let typeName = attr(el, 'type', '');
  if (typeEl) {
    const href = typeEl.attributes['href'] || '';
    const hashIdx = href.lastIndexOf('#');
    if (hashIdx >= 0) typeName = href.substring(hashIdx + 1);
    if (!typeName) typeName = attr(typeEl, 'name', 'String');
  }
  if (!typeName) typeName = 'String';

  // Parse multiplicity
  const lowerEl = findElement(el, 'lowerValue');
  const upperEl = findElement(el, 'upperValue');
  let multiplicity: MultiplicityElement = Multiplicity.ONE;
  if (lowerEl || upperEl) {
    const lower = parseInt(attr(lowerEl, 'value', '1'), 10) || 0;
    const upperStr = attr(upperEl, 'value', '1');
    const upper = upperStr === '*' ? -1 : (parseInt(upperStr, 10) || 1);
    multiplicity = { lower, upper, isOrdered: false, isUnique: true };
  }

  // Parse default value
  const defaultEl = findElement(el, 'defaultValue');
  const defaultValue = defaultEl ? attr(defaultEl, 'value') : undefined;

  const isId = attr(el, 'isID') === 'true';
  const constraints: UMLProperty['constraints'] = [];
  if (isId) constraints.push({ kind: 'primaryKey' });

  return {
    xmiId: attr(el, 'xmi:id', attr(el, 'id', `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)),
    name: attr(el, 'name', 'unnamed'),
    type: typeName,
    visibility: (attr(el, 'visibility', 'private') as VisibilityKind),
    isStatic: attr(el, 'isStatic') === 'true',
    isReadOnly: attr(el, 'isReadOnly') === 'true',
    isDerived: attr(el, 'isDerived') === 'true',
    isId,
    isUnique: attr(el, 'isUnique') === 'true',
    multiplicity,
    defaultValue,
    aggregation: (attr(el, 'aggregation', 'none') as AggregationKind),
    constraints: constraints.length > 0 ? constraints : undefined,
  };
}

function parseOperation(el: XmlElement): UMLOperation {
  const params = findElements(el, 'ownedParameter').map(parseParameter);

  return {
    xmiId: attr(el, 'xmi:id', attr(el, 'id', `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)),
    name: attr(el, 'name', 'unnamed'),
    visibility: (attr(el, 'visibility', 'public') as VisibilityKind),
    isStatic: attr(el, 'isStatic') === 'true',
    isAbstract: attr(el, 'isAbstract') === 'true',
    isQuery: attr(el, 'isQuery') === 'true',
    ownedParameters: params,
  };
}

function parseParameter(el: XmlElement): UMLParameter {
  const typeEl = findElement(el, 'type');
  let typeName = attr(el, 'type', 'String');
  if (typeEl) {
    const href = typeEl.attributes['href'] || '';
    const hashIdx = href.lastIndexOf('#');
    if (hashIdx >= 0) typeName = href.substring(hashIdx + 1);
    if (!typeName) typeName = attr(typeEl, 'name', 'String');
  }

  return {
    xmiId: attr(el, 'xmi:id', attr(el, 'id', `param_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)),
    name: attr(el, 'name', 'param'),
    type: typeName,
    direction: (attr(el, 'direction', 'in') as UMLParameter['direction']),
  };
}

function parseAssociation(el: XmlElement): UMLAssociation {
  const memberEndEls = findElements(el, 'memberEnd');
  const memberEnds: [string, string] = [
    memberEndEls[0] ? attr(memberEndEls[0], 'xmi:idref', attr(memberEndEls[0], 'idref', '')) : '',
    memberEndEls[1] ? attr(memberEndEls[1], 'xmi:idref', attr(memberEndEls[1], 'idref', '')) : '',
  ];

  const ownedEnds = findElements(el, 'ownedEnd').map(parseProperty);
  if (ownedEnds.length === 0) {
    ownedEnds.push(...findElements(el, 'ownedAttribute').map(parseProperty));
  }

  return {
    xmiId: attr(el, 'xmi:id', attr(el, 'id', `assoc_${Date.now()}`)),
    xmiType: 'uml:Association',
    name: attr(el, 'name') || undefined,
    memberEnds,
    ownedEnds,
    isDerived: attr(el, 'isDerived') === 'true',
  };
}

function parseGeneralization(el: XmlElement): UMLGeneralization {
  return {
    xmiId: attr(el, 'xmi:id', attr(el, 'id', `gen_${Date.now()}`)),
    xmiType: 'uml:Generalization',
    general: attr(el, 'general', ''),
    specific: attr(el, 'specific', ''),
  };
}

function parseDependency(el: XmlElement, xmiType: UMLDependency['xmiType']): UMLDependency {
  return {
    xmiId: attr(el, 'xmi:id', attr(el, 'id', `dep_${Date.now()}`)),
    xmiType,
    name: attr(el, 'name') || undefined,
    client: attr(el, 'client', ''),
    supplier: attr(el, 'supplier', ''),
  };
}

function parseDiagram(el: XmlElement): UMLDiagram {
  const diagramElements = findElements(el, 'diagramElement').map((de): DiagramElement => {
    const boundsEl = findElement(de, 'bounds');
    return {
      xmiId: attr(de, 'xmi:id', attr(de, 'id', '')),
      modelElementRef: attr(de, 'modelElement', ''),
      bounds: {
        x: parseFloat(attr(boundsEl, 'x', '0')),
        y: parseFloat(attr(boundsEl, 'y', '0')),
        width: parseFloat(attr(boundsEl, 'width', '220')),
        height: parseFloat(attr(boundsEl, 'height', '150')),
      },
    };
  });

  return {
    xmiId: attr(el, 'xmi:id', attr(el, 'id', '')),
    name: attr(el, 'name', 'Class Diagram'),
    diagramElements,
  };
}
