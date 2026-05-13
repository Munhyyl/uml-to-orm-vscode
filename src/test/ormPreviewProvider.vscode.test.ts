import * as assert from 'assert';
import * as vscode from 'vscode';
import { OrmPreviewProvider } from '../editor/ormPreviewProvider';
import { ProjectSchema } from '../types/schema';

suite('OrmPreviewProvider', () => {
  const mockSchema: ProjectSchema = {
    version: '1.0',
    config: {
      targetLanguage: 'TypeScript',
      orm: 'Prisma',
      database: 'PostgreSQL'
    },
    entities: [
      {
        id: 'e1',
        name: 'User',
        position: { x: 0, y: 0 },
        attributes: [
          {
            id: 'a1',
            name: 'id',
            type: 'Int',
            visibility: 'public',
            isPrimary: true,
            isNullable: false,
            isUnique: false
          }
        ]
      }
    ],
    relations: []
  };

  test('should return default text if no schema is provided', async () => {
    const provider = new OrmPreviewProvider();
    const uri = vscode.Uri.parse('orm-preview://preview');
    const content = await provider.provideTextDocumentContent(uri);
    assert.strictEqual(content.includes('No active schema found'), true);
  });

  test('should return generated code for a valid schema', async () => {
    const provider = new OrmPreviewProvider();
    const uri = vscode.Uri.parse('orm-preview://preview');
    provider.update(uri, mockSchema);
    const content = await provider.provideTextDocumentContent(uri);
    
    // Check if expected code is in the content
    // Prisma generator usually creates a "model User {" block for a User entity
    assert.strictEqual(content.includes('model User'), true, `Content did not contain "model User". Content was: ${content.substring(0, 100)}...`);
  });
});