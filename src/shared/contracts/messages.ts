import { ProjectSchema } from '../../types/schema';

type ToolbarGenerationMessage =
  | { command: 'generateCode'; schema?: ProjectSchema; useCurrentConfig?: boolean }
  | { command: 'generateDDL'; schema?: ProjectSchema; useCurrentConfig?: boolean }
  | { command: 'generateRepository'; schema?: ProjectSchema; useCurrentConfig?: boolean };

export type WebviewToExtensionMessage =
  | { command: 'ready' }
  | { command: 'updateSchema'; schema: ProjectSchema }
  | { command: 'saveSchema'; schema: ProjectSchema }
  | ToolbarGenerationMessage
  | { command: 'importSchema' }
  | { command: 'exportXMI' }
  | { command: 'importXMI' }
  | { command: 'saveImage'; data: string }
  | { command: 'showPreview' }
  | { command: 'requestConfirmation'; requestId: string; message: string; detail?: string; confirmLabel?: string };

export type ExtensionToWebviewMessage =
  | { command: 'loadSchema'; schema: ProjectSchema }
  | { command: 'confirmationResult'; requestId: string; confirmed: boolean };

export function isWebviewMessage(value: unknown): value is WebviewToExtensionMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as { command?: unknown };
  return typeof msg.command === 'string';
}
