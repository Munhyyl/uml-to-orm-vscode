import React from 'react';
import ReactDOM from 'react-dom/client';
import DiagramEditor from './DiagramEditor';
import { ProjectSchema } from '../types/schema';
import { createEmptySchema } from '../domain/schema/schemaOperations';

// Get initial schema from VS Code or use empty default
const getInitialSchema = (): ProjectSchema => {
  const vscode = (window as any).__vscodeApi as { getState?: () => any } | undefined;
  const state = vscode?.getState?.();
  
  if (state?.schema) {
    return state.schema;
  }

  // Default empty schema
  return createEmptySchema();
};

// Acquire VS Code API once
if (!(window as any).__vscodeApi) {
  try {
    (window as any).__vscodeApi = (window as any).acquireVsCodeApi?.();
  } catch {
    // Ignore if VS Code API is already acquired
  }
}

const initialSchema = getInitialSchema();

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <DiagramEditor initialSchema={initialSchema} />
  </React.StrictMode>
);
