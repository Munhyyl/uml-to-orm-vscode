# Project Context: UML to ORM Code Generator (VS Code Extension)

## 1. Project Overview

This project is a **VS Code Extension** that functions as a bi-directional bridge between **Visual UML Class Diagrams** and **Data Management Layer Code (ORM)**.

- **Goal:** Allow developers to visually design database schemas using UML class diagrams and automatically generate ORM code (Prisma, TypeORM, SQLAlchemy, etc.).
- **Core Features:**
  1.  **Visual Editor:** A drag-and-drop interface to create classes, attributes, methods, and relationships (using React Flow).
  2.  **Forward Engineering:** Generate code (e.g., `schema.prisma`, `.py` models) from the visual diagram.
  3.  **Reverse Engineering:** Parse existing ORM code (Prisma, SQLAlchemy, Django, TypeORM, Hibernate/JPA) to reconstruct the visual diagram.
  4.  **XMI Import/Export:** Standards-compliant XMI 2.5.1 (OMG) serialization for interoperability with Enterprise Architect, StarUML, MagicDraw, Papyrus.
  5.  **UML Metamodel Alignment:** Internal IR is bridged to OMG UML 2.5.1 metamodel types via a converter layer.
  6.  **Multi-language Support:** TypeScript (Prisma, TypeORM), Python (SQLAlchemy, Django), Java (Hibernate).

## 2. Technical Stack

- **Extension Host:** TypeScript, VS Code Extension API (CustomEditorProvider for `.orm.json` files).
- **UI/Webview:** React 18, **React Flow 11** (for the diagram canvas), **inline styles** (no Tailwind — esbuild doesn't process it).
- **State Management:** React `useState` + `useCallback` hooks (Zustand was removed).
- **Communication:** `vscode.postMessage` (Webview ↔ Extension Host).
- **Code Generation:** String concatenation (all generators: Prisma, TypeORM, SQLAlchemy, Django, Hibernate).
- **Parsing:** Regex-based Prisma parser in `schemaParserService.ts`.
- **XMI:** Custom lightweight XML parser (no DOMParser in Node.js extension host).
- **Build:** `tsc` for extension, `esbuild` CLI (inline in npm script) for webview bundle (~1.4MB).

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Webview (React + React Flow)                           │
│  DiagramEditor.tsx → EntityNode.tsx, PropertyPanel.tsx   │
│  Toolbar.tsx (Language/ORM selectors, Export XMI btn)    │
└───────────────┬─────────────────────────────────────────┘
                │ vscode.postMessage
┌───────────────▼─────────────────────────────────────────┐
│  Extension Host (TypeScript)                            │
│  extension.ts → diagramEditorProvider.ts                │
│                                                         │
│  ┌── Forward Engineering ──┐  ┌── Reverse Engineering ─┐│
│  │ codeGeneratorService.ts │  │ schemaParserService.ts  ││
│  │ orm/prismaGenerator     │  │ (Prisma, SQLAlchemy,    ││
│  │ orm/typeORMGenerator    │  │  Django, TypeORM, JPA)  ││
│  │ orm/sqlalchemyGenerator │  └─────────────────────────┘│
│  │ orm/djangoGenerator     │  ┌── XMI Layer ───────────┐│
│  │ orm/hibernateGenerator  │  │ xmiExporter.ts          ││
│  └─────────────────────────┘  │ xmiImporter.ts          ││
│                               └─────────────────────────┘│
│  ┌── Type System ──────────────────────────────────────┐│
│  │ schema.ts (IR)                                       ││
│  │ umlMetamodel.ts (OMG UML 2.5.1 types)              ││
│  │ umlConverter.ts (IR ↔ UML Metamodel bridge)         ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## 4. Data Structure (Intermediate Representation)

The system uses a JSON-based IR to bridge the UI and Code Generators. All diagrams serialize to `.orm.json` files.

```typescript
type DataType = 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime' | 'JSON' | 'Bytes' | 'Decimal';
type Visibility = 'public' | 'private' | 'protected' | 'package';
type RelationType = 'OneToOne' | 'OneToMany' | 'ManyToMany';
type UmlRelationType = 'association' | 'aggregation' | 'composition' | 'inheritance' | 'realization' | 'dependency';

interface Attribute {
  id: string;
  name: string;
  type: DataType;
  visibility: Visibility;
  isPrimary: boolean;
  isNullable: boolean;
  isUnique: boolean;
  isStatic?: boolean;
  defaultValue?: string;
}

interface Method {
  id: string;
  name: string;
  returnType: string;
  visibility: Visibility;
  parameters: Array<{ name: string; type: string }>;
  isStatic?: boolean;
  isAbstract?: boolean;
}

interface Relation {
  id: string;
  sourceClassId: string;
  targetClassId: string;
  type: RelationType;       // Auto-derived from umlType + multiplicities
  umlType: UmlRelationType; // Primary source of truth (required)
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  onDelete?: 'Cascade' | 'SetNull' | 'Restrict' | 'SetDefault';
}

interface ClassEntity {
  id: string;
  name: string;
  stereotype?: string; // 'entity' | 'abstract' | 'interface' | 'enum'
  attributes: Attribute[];
  methods?: Method[];
  position: { x: number; y: number };
}

interface ProjectSchema {
  version: '1.0';
  entities: ClassEntity[];
  relations: Relation[];
  config: {
    targetLanguage: 'TypeScript' | 'Python' | 'Java';
    orm: 'Prisma' | 'TypeORM' | 'SQLAlchemy' | 'Django' | 'Hibernate';
    projectName?: string;
  };
}
```

## 5. UML Metamodel Layer (OMG UML 2.5.1)

The IR is bridged to OMG-compliant UML types via `umlConverter.ts`:

- `projectSchemaToUMLModel(schema)` → `{ model: UMLModel, diagram: UMLDiagram }`
- `umlModelToProjectSchema(model, diagram?)` → `ProjectSchema`

XMI 2.5.1 serialization via `xmiExporter.ts` / `xmiImporter.ts`.

## 6. Key Conventions

- **UML-first design.** `umlType` is the primary relationship field. ORM `type` (OneToOne/OneToMany/ManyToMany) is auto-derived via `deriveRelationType(umlType, srcMult, tgtMult)` in `schema.ts`.
- **No Tailwind.** All styling uses inline `style` objects (React.CSSProperties).
- **No Zustand.** State lives in `DiagramEditor.tsx` via `useState`.
- **No Handlebars.** All code generators use string concatenation.
- **CustomEditorProvider** for `.orm.json` — no `activeTextEditor`. Use `_activeDocument` tracking.
- **Webview ↔ Extension** communication via `postMessage` commands: `ready`, `loadSchema`, `updateSchema`, `saveSchema`, `generateCode`, `exportXMI`.
- **File creation** via terminal `cat` heredoc when `create_file` tool is disabled.
