import * as vscode from 'vscode';
import { ProjectSchema } from '../types/schema';
import { CodeGeneratorService } from '../generators/codeGeneratorService';

/**
 * TextDocumentContentProvider to render the active diagram's code.
 */
export class OrmPreviewProvider implements vscode.TextDocumentContentProvider {
  public static readonly scheme = 'orm-preview';

  private _schema: ProjectSchema | undefined;
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this._onDidChange.event;

  public update(uri: vscode.Uri, schema: ProjectSchema) {
    this._schema = schema;
    this._onDidChange.fire(uri);
  }

  public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    if (!this._schema) {
      return '// No active schema found.\n// Please open a diagram and trigger Live Preview.';
    }

    try {
      const service = new CodeGeneratorService();
      const result = await service.generate(this._schema);
      return result;
    } catch (err: any) {
      return `/* Error generating code: ${err.message} */`;
    }
  }
}
