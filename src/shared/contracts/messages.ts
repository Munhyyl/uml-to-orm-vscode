import { ProjectSchema } from '../../types/schema';

export type WebviewToExtensionMessage =
  | { command: 'ready' }
  | { command: 'updateSchema'; schema: ProjectSchema }
  | { command: 'saveSchema'; schema: ProjectSchema }
  | { command: 'generateCode' }
  | { command: 'generateDDL' }
  | { command: 'generateRepository' }
  | { command: 'importSchema' }
  | { command: 'exportXMI' }
  | { command: 'importXMI' }
  | { command: 'requestConfirmation'; requestId: string; message: string; detail?: string; confirmLabel?: string };

export type ExtensionToWebviewMessage =
  | { command: 'loadSchema'; schema: ProjectSchema }
  | { command: 'confirmationResult'; requestId: string; confirmed: boolean };

export function isWebviewMessage(value: unknown): value is WebviewToExtensionMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as { command?: unknown };
  return typeof msg.command === 'string';
}
