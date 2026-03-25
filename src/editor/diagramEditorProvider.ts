import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectSchema } from '../types/schema';
import { CodeGeneratorService } from '../generators/codeGeneratorService';
import { projectSchemaToUMLModel } from '../types/umlConverter';
import { exportToXMI } from '../xmi/xmiExporter';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage, isWebviewMessage } from '../shared/contracts/messages';

export class DiagramEditorProvider implements vscode.CustomEditorProvider<DiagramDocument> {
  public static readonly viewType = 'uml-orm-refactor.diagramEditor';
  private readonly webviewScript: string;
  private _activeDocument: DiagramDocument | undefined;

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<DiagramDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.webviewScript = context.asAbsolutePath(path.join('dist', 'webview.js'));
  }

  /** Returns the schema from the currently active custom editor document */
  public getActiveSchema(): ProjectSchema | undefined {
    return this._activeDocument?.schema;
  }

  public getActiveDocumentUri(): vscode.Uri | undefined {
    return this._activeDocument?.uri;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<DiagramDocument> {
    const fileData = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(fileData);
    const schema: ProjectSchema = JSON.parse(content);
    return new DiagramDocument(uri, schema);
  }

  async resolveCustomEditor(
    document: DiagramDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Track active document
    this._activeDocument = document;
    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        this._activeDocument = document;
      }
    });
    webviewPanel.onDidDispose(() => {
      if (this._activeDocument === document) {
        this._activeDocument = undefined;
      }
    });

    // Send initial schema to webview
    webviewPanel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isWebviewMessage(message)) {
        return;
      }

      const typedMessage: WebviewToExtensionMessage = message;
      switch (typedMessage.command) {
        case 'ready':
          // Webview is ready, send the document schema
          webviewPanel.webview.postMessage({
            command: 'loadSchema',
            schema: document.schema,
          } satisfies ExtensionToWebviewMessage);
          break;
        case 'updateSchema':
          document.schema = typedMessage.schema;
          document.update(typedMessage.schema);
          this._onDidChangeCustomDocument.fire({
            document,
          } as any);
          break;
        case 'saveSchema':
          await document.save();
          break;
        case 'generateCode':
          // Generate code directly from the current document schema
          try {
            const genSchema = document.schema;
            if (!genSchema.entities || genSchema.entities.length === 0) {
              vscode.window.showErrorMessage('No entities in diagram. Add entities before generating code.');
              break;
            }
            const genService = new CodeGeneratorService();
            const generatedCode = await genService.generate(genSchema);
            
            const extMap: Record<string, string> = {
              'Prisma': 'prisma',
              'TypeORM': 'ts',
              'SQLAlchemy': 'py',
              'Django': 'py',
              'Hibernate': 'java',
            };
            const ext = extMap[genSchema.config.orm] || 'txt';
            const projectName = genSchema.config.projectName || 'schema';
            const ormSlug = genSchema.config.orm.toLowerCase();
            const defaultFileName = ext === 'prisma'
              ? `${projectName}.${ext}`
              : `${projectName}_${ormSlug}.${ext}`;

            const filterMap: Record<string, Record<string, string[]>> = {
              'prisma': { 'Prisma Schema': ['prisma'] },
              'ts':     { 'TypeScript': ['ts'] },
              'py':     { 'Python': ['py'] },
              'java':   { 'Java': ['java'] },
            };
            const filterLabel = filterMap[ext] || { 'All files': ['*'] };

            const defaultUri = vscode.workspace.workspaceFolders?.[0]
              ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, defaultFileName)
              : undefined;

            const saveUri = await vscode.window.showSaveDialog({
              defaultUri,
              filters: { ...filterLabel, 'All files': ['*'] },
              title: `${genSchema.config.orm} код хадгалах`,
            });
            if (!saveUri) break;

            await vscode.workspace.fs.writeFile(saveUri, Buffer.from(generatedCode));
            const openDoc = await vscode.workspace.openTextDocument(saveUri);
            await vscode.window.showTextDocument(openDoc, { preview: false, viewColumn: vscode.ViewColumn.Beside });

            const savedName = saveUri.path.split('/').pop();
            vscode.window.showInformationMessage(`✅ ${genSchema.config.orm} код үүсгэгдлээ: ${savedName}`);
          } catch (err) {
            vscode.window.showErrorMessage(`Failed to generate code: ${err}`);
          }
          break;
        case 'exportXMI':
          try {
            const xmiSchema = document.schema;
            if (!xmiSchema.entities || xmiSchema.entities.length === 0) {
              vscode.window.showErrorMessage('No entities in diagram. Add entities before exporting.');
              break;
            }
            const { model, diagram } = projectSchemaToUMLModel(xmiSchema);
            const xmiContent = exportToXMI(model, diagram);

            const xmiProjectName = xmiSchema.config.projectName || 'diagram';
            const xmiDefaultFileName = `${xmiProjectName}_uml.xmi`;
            const xmiDefaultUri = vscode.workspace.workspaceFolders?.[0]
              ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, xmiDefaultFileName)
              : undefined;

            const xmiSaveUri = await vscode.window.showSaveDialog({
              defaultUri: xmiDefaultUri,
              filters: { 'XMI files': ['xmi', 'xml'], 'All files': ['*'] },
              title: 'XMI файл хадгалах',
            });
            if (!xmiSaveUri) break;

            await vscode.workspace.fs.writeFile(xmiSaveUri, Buffer.from(xmiContent));
            const xmiDoc = await vscode.workspace.openTextDocument(xmiSaveUri);
            await vscode.window.showTextDocument(xmiDoc, { preview: false, viewColumn: vscode.ViewColumn.Beside });

            const xmiSavedName = xmiSaveUri.path.split('/').pop();
            vscode.window.showInformationMessage(`✅ XMI экспорт хийгдлээ: ${xmiSavedName}`);
          } catch (xmiErr) {
            vscode.window.showErrorMessage(`Failed to export XMI: ${xmiErr}`);
          }
          break;
        case 'requestConfirmation':
          try {
            const confirmLabel = typedMessage.confirmLabel || 'Delete';
            const picked = await vscode.window.showWarningMessage(
              typedMessage.message,
              {
                modal: true,
                detail: typedMessage.detail,
              },
              confirmLabel,
              'Cancel'
            );

            webviewPanel.webview.postMessage({
              command: 'confirmationResult',
              requestId: typedMessage.requestId,
              confirmed: picked === confirmLabel,
            } satisfies ExtensionToWebviewMessage);
          } catch {
            webviewPanel.webview.postMessage({
              command: 'confirmationResult',
              requestId: typedMessage.requestId,
              confirmed: false,
            } satisfies ExtensionToWebviewMessage);
          }
          break;
      }
    });
  }

  async saveCustomDocument(document: DiagramDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    await document.save();
  }

  async saveCustomDocumentAs(document: DiagramDocument, destinationUri: vscode.Uri, _cancellation: vscode.CancellationToken): Promise<void> {
    const content = JSON.stringify(document.schema, null, 2);
    await vscode.workspace.fs.writeFile(destinationUri, Buffer.from(content));
  }

  async revertCustomDocument(document: DiagramDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const fileData = await vscode.workspace.fs.readFile(document.uri);
    const content = new TextDecoder().decode(fileData);
    document.schema = JSON.parse(content);
  }

  async backupCustomDocument(document: DiagramDocument, _context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    if (cancellation.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    const content = JSON.stringify(document.schema, null, 2);
    // Use a temp file path since context doesn't directly provide backupUri
    const backupPath = document.uri.with({ path: document.uri.path + '.backup' });
    await vscode.workspace.fs.writeFile(backupPath, Buffer.from(content));

    if (cancellation.isCancellationRequested) {
      try {
        await vscode.workspace.fs.delete(backupPath);
      } catch {
        // Ignore cleanup errors
      }
      throw new vscode.CancellationError();
    }

    return {
      id: backupPath.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(backupPath);
        } catch {
          // Ignore errors
        }
      },
    };
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(this.webviewScript));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UML to ORM Diagram Editor</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body, #root {
      height: 100%;
      width: 100%;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      overflow: hidden;
      background-color: #0e1117;
      color: #e0e0e0;
    }
    #root {
      display: flex;
      flex-direction: column;
    }
    .reactflow-wrapper {
      flex: 1;
      min-height: 0;
      min-width: 0;
      height: 100%;
    }
    /* ReactFlow custom styling */
    .react-flow__background {
      background-color: #0e1117 !important;
    }
    .react-flow__minimap {
      background-color: #1a1d29 !important;
      border: 1px solid #2d3748 !important;
    }
    .react-flow__controls {
      background-color: #1a1d29 !important;
      border: 1px solid #2d3748 !important;
    }
    .react-flow__controls button {
      background-color: #2d3748 !important;
      border-bottom: 1px solid #1a1d29 !important;
      color: #e0e0e0 !important;
    }
    .react-flow__controls button:hover {
      background-color: #3b4252 !important;
    }
    /* Entity node styling */
    .entity-node {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: 2px solid #8b5cf6;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3);
      padding: 16px;
      min-width: 220px;
      transition: all 0.3s ease;
    }
    .entity-node:hover {
      box-shadow: 0 8px 30px rgba(139, 92, 246, 0.5);
      transform: translateY(-2px);
    }
    .entity-node.selected {
      border-color: #a78bfa;
      box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.3);
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}

export class DiagramDocument implements vscode.Disposable {
  private _onDidChangeDocument = new vscode.EventEmitter<{
    readonly undo: () => void;
    readonly redo: () => void;
  }>();
  public readonly onDidChange = this._onDidChangeDocument.event;

  private _onDidDispose = new vscode.EventEmitter<void>();
  public readonly onDidDispose = this._onDidDispose.event;

  constructor(
    public readonly uri: vscode.Uri,
    public schema: ProjectSchema
  ) {}

  update(schema: ProjectSchema) {
    this.schema = schema;
    this._onDidChangeDocument.fire({
      undo: () => {},
      redo: () => {},
    });
  }

  async save() {
    const content = JSON.stringify(this.schema, null, 2);
    await vscode.workspace.fs.writeFile(this.uri, Buffer.from(content));
  }

  dispose() {
    this._onDidDispose.fire();
  }
}
