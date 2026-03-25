import * as vscode from 'vscode';
import { DiagramEditorProvider } from './editor/diagramEditorProvider';
import { createEmptySchema } from './domain/schema/schemaOperations';
import { CodeGeneratorService } from './generators/codeGeneratorService';
import { SchemaParserService } from './parsers/schemaParserService';
import { OrmType, TargetLanguage } from './types/schema';
import { projectSchemaToUMLModel } from './types/umlConverter';
import { exportToXMI } from './xmi/xmiExporter';
import { importFromXMI } from './xmi/xmiImporter';

const REFACTOR_VIEW_TYPE = 'uml-orm-refactor.diagramEditor';
const REFACTOR_PROJECT_VIEW_ID = 'uml-orm-refactor.projectView';
const DIAGRAMS_LABEL = '📂 Diagrams';
const ACTIONS_LABEL = '⚙ Actions';
const REFACTOR_COMMANDS = {
  openEditor: 'uml-orm-refactor.openEditor',
  generateCode: 'uml-orm-refactor.generateCode',
  importSchema: 'uml-orm-refactor.importSchema',
  exportXMI: 'uml-orm-refactor.exportXMI',
  importXMI: 'uml-orm-refactor.importXMI',
} as const;

function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

function getFileName(uri: vscode.Uri): string {
  return uri.path.split('/').pop() || uri.fsPath;
}

async function openFileBeside(uri: vscode.Uri): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
}

// ─── Activity Bar TreeDataProvider ─────────────────────────────────

class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly command?: vscode.Command,
    public readonly iconPath?: vscode.ThemeIcon,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
    if (iconPath) this.iconPath = iconPath;
  }
}

class ProjectViewProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    if (!element) {
      // Root items
      return [
        new ProjectTreeItem(
          '✨ New Diagram',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.openEditor, title: 'New Diagram' },
          new vscode.ThemeIcon('add'),
        ),
        new ProjectTreeItem(
          DIAGRAMS_LABEL,
          vscode.TreeItemCollapsibleState.Expanded,
          'category',
          undefined,
          new vscode.ThemeIcon('file-code'),
        ),
        new ProjectTreeItem(
          ACTIONS_LABEL,
          vscode.TreeItemCollapsibleState.Expanded,
          'category',
          undefined,
          new vscode.ThemeIcon('tools'),
        ),
      ];
    }

    if (element.label === DIAGRAMS_LABEL) {
      // Find all .orm.json files in workspace
      const files = await vscode.workspace.findFiles('**/*.orm.json', '**/node_modules/**');
      return files.map((file) => {
        const name = getFileName(file);
        return new ProjectTreeItem(
          name,
          vscode.TreeItemCollapsibleState.None,
          'diagram',
          { command: 'vscode.openWith', title: 'Open Diagram', arguments: [file, REFACTOR_VIEW_TYPE] },
          new vscode.ThemeIcon('symbol-class'),
        );
      });
    }

    if (element.label === ACTIONS_LABEL) {
      return [
        new ProjectTreeItem(
          'Generate Code',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.generateCode, title: 'Generate Code' },
          new vscode.ThemeIcon('play'),
        ),
        new ProjectTreeItem(
          'Import Schema',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.importSchema, title: 'Import Schema' },
          new vscode.ThemeIcon('cloud-download'),
        ),
        new ProjectTreeItem(
          'Export XMI',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.exportXMI, title: 'Export XMI' },
          new vscode.ThemeIcon('cloud-upload'),
        ),
        new ProjectTreeItem(
          'Import XMI',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.importXMI, title: 'Import XMI' },
          new vscode.ThemeIcon('cloud-download'),
        ),
      ];
    }

    return [];
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('UML to ORM Generator extension is now active');

  // Register custom editor for .orm.json files
  const editorProvider = new DiagramEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      REFACTOR_VIEW_TYPE,
      editorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // File system watcher for .orm.json files
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.orm.json');
  context.subscriptions.push(watcher);

  // Register Activity Bar TreeDataProvider
  const projectViewProvider = new ProjectViewProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(REFACTOR_PROJECT_VIEW_ID, projectViewProvider)
  );

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleProjectViewRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      projectViewProvider.refresh();
    }, 300);
  };

  context.subscriptions.push(
    new vscode.Disposable(() => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
    })
  );

  // Refresh tree when .orm.json files change
  watcher.onDidCreate(scheduleProjectViewRefresh);
  watcher.onDidDelete(scheduleProjectViewRefresh);
  watcher.onDidChange(scheduleProjectViewRefresh);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.openEditor, async () => {
      // Create a new diagram file
      const fileName = await vscode.window.showInputBox({
        prompt: 'Enter diagram file name (without extension)',
        validateInput: (value) => {
          if (!value || value.trim() === '') return 'Name cannot be empty';
          if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Only alphanumeric characters, dash, and underscore allowed';
          return null;
        },
      });

      if (!fileName) return;

      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const uri = vscode.Uri.joinPath(workspaceFolder.uri, `${fileName}.orm.json`);
      const defaultSchema = createEmptySchema(fileName);

      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(JSON.stringify(defaultSchema, null, 2))
      );
      
      await vscode.commands.executeCommand('vscode.openWith', uri, REFACTOR_VIEW_TYPE);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.generateCode, async () => {
      // Try to get schema from the custom editor first
      let schema = editorProvider.getActiveSchema();

      // Fallback: try active text editor (if .orm.json is opened as text)
      if (!schema) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.fileName.endsWith('.orm.json')) {
          try {
            schema = JSON.parse(editor.document.getText());
          } catch {
            vscode.window.showErrorMessage('Failed to parse schema from active editor.');
            return;
          }
        }
      }

      if (!schema) {
        vscode.window.showErrorMessage('No diagram open. Please open a .orm.json file first.');
        return;
      }

      if (!schema.entities || schema.entities.length === 0) {
        vscode.window.showErrorMessage('No entities in diagram. Add entities before generating code.');
        return;
      }

      // ── Let user pick target language ──
      const langMap: Record<TargetLanguage, OrmType[]> = {
        'TypeScript': ['Prisma', 'TypeORM'],
        'Python':     ['SQLAlchemy', 'Django'],
        'Java':       ['Hibernate'],
      };
      const langPick = await vscode.window.showQuickPick(
        Object.keys(langMap).map(l => ({ label: l, description: l === schema!.config.targetLanguage ? '(одоогийн)' : '' })),
        { placeHolder: 'Хэл сонгоно уу', title: 'Код генерац — Хэл' }
      );
      if (!langPick) return;
      const selectedLang = langPick.label as 'TypeScript' | 'Python' | 'Java';

      // ── Let user pick ORM framework ──
      const ormChoices = langMap[selectedLang];
      let selectedOrm: OrmType = ormChoices[0];
      if (ormChoices.length > 1) {
        const ormPick = await vscode.window.showQuickPick(
          ormChoices.map(o => ({ label: o, description: o === schema!.config.orm ? '(одоогийн)' : '' })),
          { placeHolder: 'ORM сонгоно уу', title: 'Код генерац — ORM' }
        );
        if (!ormPick) return;
        selectedOrm = ormPick.label as OrmType;
      }

      // Apply chosen language + ORM to schema for generation
      schema.config.targetLanguage = selectedLang;
      schema.config.orm = selectedOrm;

      try {
        const generator = new CodeGeneratorService();
        const code = await generator.generate(schema);

        // Determine file extension and nice default name
        const extMap: Record<string, string> = {
          'Prisma': 'prisma',
          'TypeORM': 'ts',
          'SQLAlchemy': 'py',
          'Django': 'py',
          'Hibernate': 'java',
        };
        const ext = extMap[schema.config.orm] || 'txt';
        const projectName = schema.config.projectName || 'schema';
        const ormSlug = schema.config.orm.toLowerCase();
        const defaultFileName = ext === 'prisma'
          ? `${projectName}.${ext}`
          : `${projectName}_${ormSlug}.${ext}`;

        // Let user pick save location
        const filterMap: Record<string, Record<string, string[]>> = {
          'prisma': { 'Prisma Schema': ['prisma'] },
          'ts':     { 'TypeScript': ['ts'] },
          'py':     { 'Python': ['py'] },
          'java':   { 'Java': ['java'] },
        };
        const filterLabel = filterMap[ext] || { 'All files': ['*'] };

        const workspaceFolder = getPrimaryWorkspaceFolder();
        const defaultUri = workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder.uri, defaultFileName)
          : undefined;

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { ...filterLabel, 'All files': ['*'] },
          title: `${schema.config.orm} код хадгалах`,
        });
        if (!saveUri) return;

        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(code));
        await openFileBeside(saveUri);

        const savedName = getFileName(saveUri);
        vscode.window.showInformationMessage(`✅ ${schema.config.orm} код үүсгэгдлээ: ${savedName}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate code: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.importSchema, async () => {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'Schema files': ['prisma', 'ts', 'py', 'java'],
          'All files': ['*'],
        },
      });

      if (!files || files.length === 0) return;

      try {
        const parser = new SchemaParserService();
        const schema = await parser.parseFile(files[0]);
        
        vscode.window.showInformationMessage('Schema imported successfully!');
        console.log('Imported schema:', schema);

        // Save the imported schema as a new .orm.json file
        const workspaceFolder = getPrimaryWorkspaceFolder();
        if (workspaceFolder) {
          const newUri = vscode.Uri.joinPath(
            workspaceFolder.uri,
            `imported-${Date.now()}.orm.json`
          );
          await vscode.workspace.fs.writeFile(
            newUri,
            Buffer.from(JSON.stringify(schema, null, 2))
          );
          await vscode.commands.executeCommand('vscode.openWith', newUri, REFACTOR_VIEW_TYPE);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to import schema: ${error}`);
      }
    })
  );

  // ─── XMI Export Command ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.exportXMI, async () => {
      const schema = editorProvider.getActiveSchema();
      if (!schema) {
        vscode.window.showErrorMessage('No diagram open. Please open a .orm.json file first.');
        return;
      }
      if (!schema.entities || schema.entities.length === 0) {
        vscode.window.showErrorMessage('No entities in diagram. Add entities before exporting.');
        return;
      }

      try {
        const { model, diagram } = projectSchemaToUMLModel(schema);
        const xmiContent = exportToXMI(model, diagram);

        const projectName = schema.config.projectName || 'diagram';
        const defaultFileName = `${projectName}_uml.xmi`;
        const workspaceFolder = getPrimaryWorkspaceFolder();
        const defaultUri = workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder.uri, defaultFileName)
          : undefined;

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { 'XMI files': ['xmi', 'xml'], 'All files': ['*'] },
          title: 'XMI файл хадгалах',
        });
        if (!saveUri) return;

        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(xmiContent));
        await openFileBeside(saveUri);

        const savedName = getFileName(saveUri);
        vscode.window.showInformationMessage(`✅ XMI экспорт хийгдлээ: ${savedName}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export XMI: ${error}`);
      }
    })
  );

  // ─── XMI Import Command ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.importXMI, async () => {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'XMI files': ['xmi', 'xml'],
          'All files': ['*'],
        },
      });

      if (!files || files.length === 0) return;

      try {
        const fileData = await vscode.workspace.fs.readFile(files[0]);
        const xmiContent = new TextDecoder().decode(fileData);
        const schema = importFromXMI(xmiContent);

        const workspaceFolder = getPrimaryWorkspaceFolder();
        if (workspaceFolder) {
          const newUri = vscode.Uri.joinPath(
            workspaceFolder.uri,
            `imported-xmi-${Date.now()}.orm.json`
          );
          await vscode.workspace.fs.writeFile(
            newUri,
            Buffer.from(JSON.stringify(schema, null, 2))
          );
          await vscode.commands.executeCommand('vscode.openWith', newUri, REFACTOR_VIEW_TYPE);
          vscode.window.showInformationMessage('✅ XMI imported successfully!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to import XMI: ${error}`);
      }
    })
  );
}

export function deactivate() {
  console.log('UML to ORM Generator extension is now deactivated');
}
