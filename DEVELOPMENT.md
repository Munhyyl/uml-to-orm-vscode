# Development Guide

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- VS Code 1.85+

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd thesis

# Install dependencies
npm install

# Build the extension
npm run compile
npm run build:webview
```

### Running the Extension

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. This opens a new VS Code window with the extension loaded

### Development Workflow

#### Extending the Code Generator

To add support for a new ORM:

1. Create a new file in `src/generators/orm/` (e.g., `newOrmGenerator.ts`)
2. Implement the `CodeGenerator` interface
3. Register it in `CodeGeneratorService`

Example:

```typescript
export class MyOrmGenerator implements CodeGenerator {
  async generate(schema: ProjectSchema): Promise<string> {
    // Implement generation logic
    return generatedCode;
  }
}
```

4. Add to `codeGeneratorService.ts`:

```typescript
this.generators.set('MyORM', new MyOrmGenerator());
```

#### Adding New Data Types

1. Update `src/types/schema.ts` - add to `DataType` union
2. Update each generator's `mapDataType()` method
3. Update the UI components to display the new type

#### Modifying the Webview

The webview is built with React and React Flow:

1. Edit components in `src/webview/`
2. Run `npm run watch:webview` during development
3. The extension will automatically reload

### Project Structure

```
src/
├── extension.ts                 # Extension entry point
├── types/
│   └── schema.ts               # Core data types
├── editor/
│   └── diagramEditorProvider.ts # Custom editor for VS Code
├── generators/
│   ├── codeGeneratorService.ts
│   └── orm/
│       ├── prismaGenerator.ts
│       ├── typeORMGenerator.ts
│       ├── sqlalchemyGenerator.ts
│       ├── hibernateGenerator.ts
│       └── djangoGenerator.ts
├── parsers/
│   └── schemaParserService.ts
├── types/
│   ├── schema.ts
│   ├── umlMetamodel.ts
│   └── umlConverter.ts
├── xmi/
│   ├── xmiExporter.ts
│   └── xmiImporter.ts
├── utils/
│   └── schemaValidator.ts
├── webview/
│   ├── DiagramEditor.tsx
│   ├── EntityNode.tsx
│   ├── Toolbar.tsx
│   ├── PropertyPanel.tsx
│   └── index.tsx
└── test/
    ├── schemaValidator.test.ts
    └── prismaGenerator.test.ts
```

### Testing

Run tests:

```bash
npm test
```

### Building for Release

```bash
npm run compile
npm run build:webview
npm run package
```

This creates a `.vsix` file that can be distributed.

### Debugging

#### Extension Code (TypeScript)

- Set breakpoints in VS Code
- Run `F5` to start debugging
- Debug console shows extension logs

#### Webview Code (React)

- The webview runs in a VS Code webview context
- Use `console.log()` and check VS Code's "Developer Tools"
- In the extension host window, go to Help → Toggle Developer Tools

### Common Tasks

#### Adding a New Command

1. Register in `package.json` under `contributes.commands`
2. Implement in `extension.ts`
3. Add keyboard shortcut (optional) in `package.json`

#### Customizing the Editor UI

1. Edit React components in `src/webview/`
2. Use inline `style` objects for styling (not TailwindCSS)
3. State is managed via React `useState` hooks in `DiagramEditor.tsx`

#### Supporting a New Language

1. Add to `TargetLanguage` type in `src/types/schema.ts`
2. Create new generator(s) in `src/generators/orm/`
3. Update reverse parser in `src/parsers/schemaParserService.ts`

### Performance Tips

- Use React Flow's node virtualization for large diagrams
- Memoize expensive computations
- Lazy load generators as needed

### Publishing to VS Code Marketplace

1. Create a Microsoft account and get publisher access
2. Update version in `package.json`
3. Run `npm run publish` (requires Azure DevOps token)

### Troubleshooting

**Webview not loading:**

- Check browser console in Developer Tools
- Verify `dist/webview.js` exists
- Check for CSP (Content Security Policy) errors

**Generators not working:**

- Verify schema is valid (run SchemaValidator)
- Check console output for error messages
- Enable TypeScript strict mode

**React components not updating:**

- Ensure state is immutable (spread objects/arrays)
- Check `useState` / `useCallback` dependencies
- Check for circular dependencies

## Contributing

See README.md for contribution guidelines.
