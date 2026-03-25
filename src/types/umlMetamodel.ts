/**
 * UML 2.5.1 Metamodel Types (OMG Specification Aligned)
 *
 * TypeScript types that mirror the official UML 2.5.1 metamodel
 * from the OMG (Object Management Group) specification.
 *
 * References:
 *   - OMG UML 2.5.1 Specification (formal/2017-12-05)
 *   - Chapter 7:  Common Structure
 *   - Chapter 9:  Classification
 *   - Chapter 11: Structured Classifiers
 *   - Chapter 12: Packages
 *
 * Mapping to XMI 2.5.1 serialization format.
 */

// ─── 7.4 VisibilityKind ──────────────────────────────────────────────
export type VisibilityKind = 'public' | 'private' | 'protected' | 'package';

// ─── 7.8 PrimitiveType ──────────────────────────────────────────────
export type UMLPrimitiveType =
  | 'Boolean'
  | 'Integer'
  | 'Real'
  | 'String'
  | 'UnlimitedNatural';

// Extended types for ORM mapping (practical for code generation)
export type ExtendedDataType =
  | UMLPrimitiveType
  | 'DateTime'
  | 'Date'
  | 'Time'
  | 'Decimal'
  | 'Float'
  | 'Long'
  | 'Byte'
  | 'JSON'
  | 'Bytes'
  | 'UUID'
  | 'Text'
  | 'Void';

// ─── 9.5.4 MultiplicityElement ──────────────────────────────────────
export interface MultiplicityElement {
  lower: number;       // 0, 1, etc.
  upper: number;       // 1, -1 (= *), etc.  -1 means unlimited
  isOrdered: boolean;
  isUnique: boolean;
}

// Helper to create common multiplicities
export const Multiplicity = {
  ONE:          { lower: 1, upper: 1,  isOrdered: false, isUnique: true } as MultiplicityElement,
  ZERO_OR_ONE:  { lower: 0, upper: 1,  isOrdered: false, isUnique: true } as MultiplicityElement,
  ZERO_OR_MORE: { lower: 0, upper: -1, isOrdered: false, isUnique: true } as MultiplicityElement,
  ONE_OR_MORE:  { lower: 1, upper: -1, isOrdered: false, isUnique: true } as MultiplicityElement,
};

// ─── 9.9.17 Parameter ───────────────────────────────────────────────
export type ParameterDirectionKind = 'in' | 'out' | 'inout' | 'return';

export interface UMLParameter {
  xmiId: string;
  name: string;
  type: string;
  direction: ParameterDirectionKind;
  multiplicity?: MultiplicityElement;
  defaultValue?: string;
}

// ─── 9.9.14 Operation ───────────────────────────────────────────────
export interface UMLOperation {
  xmiId: string;
  name: string;
  visibility: VisibilityKind;
  isStatic: boolean;
  isAbstract: boolean;
  isQuery: boolean;                       // Does not modify state
  ownedParameters: UMLParameter[];        // Includes return parameter
}

// ─── 9.9.15 Property (Attribute / Association End) ──────────────────
export interface UMLProperty {
  xmiId: string;
  name: string;
  type: string;                           // Type name or xmiId reference
  visibility: VisibilityKind;
  isStatic: boolean;
  isReadOnly: boolean;
  isDerived: boolean;
  isId: boolean;                          // <<id>> stereotype (for PK)
  isUnique: boolean;
  multiplicity: MultiplicityElement;
  defaultValue?: string;
  aggregation: AggregationKind;           // For association ends
  constraints?: PropertyConstraint[];     // ORM-specific extensions
}

export type AggregationKind = 'none' | 'shared' | 'composite';

// ORM constraint extensions (not in UML spec, useful for code generation)
export interface PropertyConstraint {
  kind: 'primaryKey' | 'unique' | 'notNull' | 'autoIncrement' | 'index';
  name?: string;
}

// ─── 9.9.3 Class ────────────────────────────────────────────────────
export interface UMLClass {
  xmiId: string;
  xmiType: 'uml:Class' | 'uml:Interface' | 'uml:DataType' | 'uml:Enumeration';
  name: string;
  visibility: VisibilityKind;
  isAbstract: boolean;
  isActive: boolean;
  ownedAttributes: UMLProperty[];         // Chapter 9.5.3
  ownedOperations: UMLOperation[];        // Chapter 9.5.3
  appliedStereotypes: string[];           // e.g., ["entity", "table"]
  documentation?: string;
  ownedLiterals?: UMLEnumerationLiteral[];
}

export interface UMLEnumerationLiteral {
  xmiId: string;
  name: string;
}

// ─── 11.5 Association ───────────────────────────────────────────────
export interface UMLAssociation {
  xmiId: string;
  xmiType: 'uml:Association';
  name?: string;
  memberEnds: [string, string];           // xmiId references to Properties
  ownedEnds: UMLProperty[];               // Navigable ends
  isDerived: boolean;
}

// ─── 9.9.7 Generalization ───────────────────────────────────────────
export interface UMLGeneralization {
  xmiId: string;
  xmiType: 'uml:Generalization';
  general: string;                        // xmiId of parent class
  specific: string;                       // xmiId of child class
}

// ─── 7.7.3 Dependency ──────────────────────────────────────────────
export interface UMLDependency {
  xmiId: string;
  xmiType: 'uml:Dependency' | 'uml:Realization' | 'uml:Usage' | 'uml:Abstraction';
  name?: string;
  client: string;                         // xmiId of dependent element
  supplier: string;                       // xmiId of target element
}

// ─── 12.2.4 Package ────────────────────────────────────────────────
export interface UMLPackage {
  xmiId: string;
  xmiType: 'uml:Package' | 'uml:Model';
  name: string;
  packagedElements: (UMLClass | UMLAssociation | UMLGeneralization | UMLDependency | UMLPackage)[];
}

// ─── UML Model (Root) ──────────────────────────────────────────────
export interface UMLModel extends UMLPackage {
  xmiType: 'uml:Model';
  xmiVersion: '2.5.1';
}

// ─── Diagram Layout (DI — Diagram Interchange) ─────────────────────
export interface DiagramElement {
  xmiId: string;
  modelElementRef: string;                // xmiId of the UML element
  bounds: { x: number; y: number; width: number; height: number };
}

export interface UMLDiagram {
  xmiId: string;
  name: string;
  diagramElements: DiagramElement[];
}

// ─── Mapping Utilities ──────────────────────────────────────────────

/** Maps our simplified DataType to UML PrimitiveType names */
export function toUMLPrimitiveType(dataType: string): string {
  const mapping: Record<string, string> = {
    'String':   'String',
    'Int':      'Integer',
    'Float':    'Real',
    'Boolean':  'Boolean',
    'DateTime': 'DateTime',
    'JSON':     'JSON',
    'Bytes':    'Bytes',
    'Decimal':  'Decimal',
    'void':     'Void',
  };
  return mapping[dataType] || dataType;
}

/** Maps UML PrimitiveType back to our simplified DataType */
export function fromUMLPrimitiveType(umlType: string): string {
  const mapping: Record<string, string> = {
    'String':            'String',
    'Integer':           'Int',
    'Real':              'Float',
    'Boolean':           'Boolean',
    'DateTime':          'DateTime',
    'JSON':              'JSON',
    'Bytes':             'Bytes',
    'Decimal':           'Decimal',
    'Void':              'void',
    'UnlimitedNatural':  'Int',
  };
  return mapping[umlType] || 'String';
}

/** Converts multiplicity to display string (e.g., "1", "0..1", "0..*", "1..*") */
export function multiplicityToString(m: MultiplicityElement): string {
  const upper = m.upper === -1 ? '*' : String(m.upper);
  if (m.lower === 1 && m.upper === 1) return '1';
  if (m.lower === 0 && m.upper === -1) return '*';
  return `${m.lower}..${upper}`;
}

/** Parses a multiplicity string like "0..*" into a MultiplicityElement */
export function parseMultiplicityString(s: string): MultiplicityElement {
  s = s.trim();
  if (s === '*')    return Multiplicity.ZERO_OR_MORE;
  if (s === '1')    return Multiplicity.ONE;
  if (s === '0..1') return Multiplicity.ZERO_OR_ONE;
  if (s === '1..*') return Multiplicity.ONE_OR_MORE;

  const parts = s.split('..');
  if (parts.length === 2) {
    const lower = parseInt(parts[0], 10) || 0;
    const upper = parts[1] === '*' ? -1 : (parseInt(parts[1], 10) || 1);
    return { lower, upper, isOrdered: false, isUnique: true };
  }

  const n = parseInt(s, 10);
  if (!isNaN(n)) return { lower: n, upper: n, isOrdered: false, isUnique: true };

  return Multiplicity.ONE;
}
