import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  useNodesState,
  useEdgesState,
  MiniMap,
  Controls,
  Background,
  NodeTypes,
  EdgeTypes,
  OnSelectionChangeParams,
} from 'reactflow';
import reactFlowStyles from 'reactflow/dist/style.css';
import { EntityNode } from './EntityNode';
import { Toolbar } from './Toolbar';
import { PropertyPanel } from './PropertyPanel';
import { UmlMarkerDefs, UmlRelationEdge } from './UmlRelationEdge';
import { ProjectSchema, ClassEntity, Relation, OrmType, TargetLanguage } from '../types/schema';
import { createEntity, createRelation, removeEntities, removeRelations, upsertEntity, upsertRelation } from '../domain/schema/schemaOperations';
import { useDiagramState, useClipboard, useVscodeMessaging, useConfirmation } from './useDiagramState';

const nodeTypes: NodeTypes = {
  entity: EntityNode,
};

const edgeTypes: EdgeTypes = {
  umlRelation: UmlRelationEdge,
};

function createEdgeFromRelation(relation: Relation): Edge {
  return {
    id: relation.id,
    source: relation.sourceClassId,
    target: relation.targetClassId,
    type: 'umlRelation',
    data: { relation },
  };
}

export const DiagramEditor: React.FC<{ initialSchema: ProjectSchema }> = ({ initialSchema }) => {
  useEffect(() => {
    const styleId = 'uml-orm-reactflow-base-style';
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = reactFlowStyles;
    document.head.appendChild(style);

    return () => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
  }, []);

  // ─── Custom hooks for state management ──────────────────────
  const { state: appState, dispatch, pushHistory, undo: handleUndo, redo: handleRedo, canUndo, canRedo } = useDiagramState(initialSchema);
  const { copy: clipboardCopy, paste: clipboardPaste, hasCopied } = useClipboard();
  const { postMessage, getVscodeApi } = useVscodeMessaging();
  const { requestConfirmation, handleConfirmationResult, cleanup: cleanupConfirmation } = useConfirmation();

  // ─── Toast notifications ──────────────────────────────────────
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' | 'info' }>>([]);
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // ─── ReactFlow ref ────────────────────────────────────────────
  const reactFlowRef = useRef<any>(null);

  const mapSchemaToNodes = useCallback((schema: ProjectSchema): Node[] => (
    schema.entities.map((entity) => ({
      id: entity.id,
      data: {
        label: entity.name,
        stereotype: entity.stereotype || 'entity',
        attributes: entity.attributes,
        methods: entity.methods || [],
        onSelect: () => dispatch({ type: 'SELECT_ENTITY', payload: entity.id }),
      },
      position: entity.position,
      type: 'entity',
    }))
  ), [dispatch]);

  const mapSchemaToEdges = useCallback((schema: ProjectSchema): Edge[] => (
    schema.relations.map((relation) => createEdgeFromRelation(relation))
  ), []);

  const handleCopy = useCallback(() => {
    const ent = appState.schema.entities.find((e) => e.id === appState.selectedEntityId);
    if (ent) clipboardCopy(ent);
  }, [appState.selectedEntityId, appState.schema.entities, clipboardCopy]);

  const initialNodes = mapSchemaToNodes(initialSchema);
  const initialEdges = mapSchemaToEdges(initialSchema);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showWelcome, setShowWelcome] = useState(initialNodes.length === 0);

  // ─── Rebuild helper (depends on setNodes/setEdges) ──────────────
  const rebuildNodesEdges = useCallback((schema: ProjectSchema) => {
    const newNodes = mapSchemaToNodes(schema);
    const newEdges = mapSchemaToEdges(schema);
    setNodes(newNodes);
    setEdges(newEdges);
    setShowWelcome(newNodes.length === 0);
    postMessage('updateSchema', { schema });
  }, [mapSchemaToNodes, mapSchemaToEdges, setNodes, setEdges, postMessage]);

  useEffect(() => {
    setNodes(mapSchemaToNodes(appState.schema));
    setEdges(mapSchemaToEdges(appState.schema));
    setShowWelcome(appState.schema.entities.length === 0);
  }, [appState.schema, mapSchemaToNodes, mapSchemaToEdges, setNodes, setEdges]);

  const handlePaste = useCallback(() => {
    if (!hasCopied) return;

    const pastedEntity = clipboardPaste();
    if (!pastedEntity) return;

    const existingNames = new Set(appState.schema.entities.map((entity) => entity.name));
    const baseName = `${pastedEntity.name}Copy`;
    let counter = 1;
    let uniqueName = baseName;
    while (existingNames.has(uniqueName)) {
      counter += 1;
      uniqueName = `${baseName}${counter}`;
    }

    const now = Date.now();
    const newEntityId = `entity_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const newEntity: ClassEntity = {
      ...pastedEntity,
      id: newEntityId,
      name: uniqueName,
      position: {
        x: pastedEntity.position.x + 40,
        y: pastedEntity.position.y + 40,
      },
      attributes: pastedEntity.attributes.map((attribute, index) => ({
        ...attribute,
        id: `attr_${now}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      })),
      methods: (pastedEntity.methods || []).map((method, index) => ({
        ...method,
        id: `method_${now}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      })),
    };

    const updatedSchema = {
      ...appState.schema,
      entities: [...appState.schema.entities, newEntity],
    };

    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    dispatch({ type: 'SELECT_ENTITY', payload: newEntity.id });
    pushHistory(updatedSchema);

    setNodes((currentNodes) => [
      ...currentNodes,
      {
        id: newEntity.id,
        data: {
          label: newEntity.name,
          stereotype: newEntity.stereotype || 'entity',
          attributes: newEntity.attributes,
          methods: newEntity.methods || [],
          onSelect: () => dispatch({ type: 'SELECT_ENTITY', payload: newEntity.id }),
        },
        position: newEntity.position,
        type: 'entity',
      },
    ]);

    postMessage('updateSchema', { schema: updatedSchema });
  }, [appState.schema, pushHistory, setNodes, clipboardPaste, hasCopied, dispatch, postMessage]);

  const handleAutoLayout = useCallback(() => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(appState.schema.entities.length)));
    const spacingX = 320;
    const spacingY = 300;
    const updatedEntities = appState.schema.entities.map((e, i) => ({
      ...e,
      position: { x: 50 + (i % cols) * spacingX, y: 50 + Math.floor(i / cols) * spacingY },
    }));
    const updatedSchema = { ...appState.schema, entities: updatedEntities };
    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    pushHistory(updatedSchema);
    setNodes((nds) =>
      nds.map((n, i) => ({ ...n, position: { x: 50 + (i % cols) * spacingX, y: 50 + Math.floor(i / cols) * spacingY } }))
    );
    postMessage('updateSchema', { schema: updatedSchema });
  }, [appState.schema, pushHistory, setNodes, dispatch, postMessage]);

  // Listen for messages from VS Code
  useEffect(() => {
    const vscode = getVscodeApi();
    
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'loadSchema') {
        const schema = message.schema;
        dispatch({ type: 'SET_SCHEMA', payload: schema });
        dispatch({ type: 'DESELECT_ALL' });
        
        // Update nodes and edges
        const newNodes = mapSchemaToNodes(schema);
        const newEdges = mapSchemaToEdges(schema);
        
        setNodes(newNodes);
        setEdges(newEdges);
        setShowWelcome(newNodes.length === 0);
      } else if (message.command === 'confirmationResult') {
        handleConfirmationResult(message.requestId, Boolean(message.confirmed));
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Tell VS Code we're ready
    vscode?.postMessage?.({ command: 'ready' });

    return () => {
      window.removeEventListener('message', handleMessage);
      cleanupConfirmation();
    };
  }, [setNodes, setEdges, dispatch, getVscodeApi, cleanupConfirmation, handleConfirmationResult, mapSchemaToNodes, mapSchemaToEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const newRelation = createRelation(connection.source || '', connection.target || '', 'association');

      const updatedSchema = {
        ...appState.schema,
        relations: [...appState.schema.relations, newRelation],
      };
      dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
      dispatch({ type: 'SELECT_RELATION', payload: newRelation.id });
      pushHistory(updatedSchema);
      postMessage('updateSchema', { schema: updatedSchema });

      // Use explicit id so edge.id matches relation.id
      setEdges((eds) => [
        ...eds,
        createEdgeFromRelation(newRelation),
      ]);
    },
    [setEdges, pushHistory, appState.schema, dispatch, postMessage]
  );

  const handleNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    const updatedSchema = {
      ...appState.schema,
      entities: appState.schema.entities.map((e) =>
        e.id === node.id ? { ...e, position: node.position } : e
      ),
    };
    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    pushHistory(updatedSchema);
    postMessage('updateSchema', { schema: updatedSchema });
  }, [appState.schema, dispatch, pushHistory, postMessage]);

  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    if (params.nodes.length > 0) {
      dispatch({ type: 'SELECT_ENTITY', payload: params.nodes[0].id });
    }
  }, [dispatch]);

  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    dispatch({ type: 'SELECT_RELATION', payload: edge.id });
  }, [dispatch]);

  const handleAddEntity = useCallback(() => {
    setShowWelcome(false);
    
    // Auto-increment class name
    const existingNames = appState.schema.entities.map(e => e.name);
    let counter = 1;
    let className = `NewClass${counter}`;
    while (existingNames.includes(className)) {
      counter++;
      className = `NewClass${counter}`;
    }

    // Place at viewport center
    let position = { x: 200, y: 150 };
    if (reactFlowRef.current) {
      const vp = reactFlowRef.current.getViewport();
      const containerEl = document.querySelector('.reactflow-wrapper');
      const w = containerEl?.clientWidth || window.innerWidth;
      const h = containerEl?.clientHeight || window.innerHeight;
      position = {
        x: (w / 2 - vp.x) / vp.zoom - 110,
        y: (h / 2 - vp.y) / vp.zoom - 75,
      };
    }

    // Avoid overlap with existing entities
    const existing = appState.schema.entities.map(e => e.position);
    while (existing.some(p => Math.abs(p.x - position.x) < 260 && Math.abs(p.y - position.y) < 220)) {
      position = { x: position.x + 40, y: position.y + 40 };
    }

    const newEntity = createEntity(className, position);

    const updatedSchema = {
      ...appState.schema,
      entities: [...appState.schema.entities, newEntity],
    };

    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    dispatch({ type: 'SELECT_ENTITY', payload: newEntity.id });

    setNodes((nds) => [
      ...nds,
      {
        id: newEntity.id,
        data: {
          label: newEntity.name,
          stereotype: newEntity.stereotype || 'entity',
          attributes: newEntity.attributes,
          methods: newEntity.methods || [],
          onSelect: () => dispatch({ type: 'SELECT_ENTITY', payload: newEntity.id }),
        },
        position: newEntity.position,
        type: 'entity',
      },
    ]);

    pushHistory(updatedSchema);
    postMessage('updateSchema', { schema: updatedSchema });
  }, [appState.schema, setNodes, dispatch, pushHistory, postMessage]);

  const handleDeleteEntity = useCallback((entityId: string) => {
    const updatedSchema = removeEntities(appState.schema, [entityId]);
    pushHistory(updatedSchema);
    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    dispatch({ type: 'DESELECT_ALL' });
    rebuildNodesEdges(updatedSchema);
  }, [appState.schema, pushHistory, rebuildNodesEdges, dispatch]);

  const handleDeleteRelation = useCallback((relationId: string) => {
    const updatedSchema = removeRelations(appState.schema, [relationId]);
    pushHistory(updatedSchema);
    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    dispatch({ type: 'DESELECT_ALL' });
    rebuildNodesEdges(updatedSchema);
  }, [appState.schema, pushHistory, rebuildNodesEdges, dispatch]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    const removedEntityIds = changes
      .filter((change) => change.type === 'remove')
      .map((change) => change.id);

    if (removedEntityIds.length === 0) return;

    const updatedSchema = removeEntities(appState.schema, removedEntityIds);

    pushHistory(updatedSchema);
    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    dispatch({ type: 'CLEAR_SELECTION_BY_DELETION', payload: { entityIds: removedEntityIds } });
    postMessage('updateSchema', { schema: updatedSchema });

    setEdges((prevEdges) =>
      prevEdges.filter(
        (edge) => !removedEntityIds.includes(edge.source) && !removedEntityIds.includes(edge.target)
      )
    );
  }, [onNodesChange, pushHistory, setEdges, appState.schema, dispatch, postMessage]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    const removedRelationIds = changes
      .filter((change) => change.type === 'remove')
      .map((change) => change.id);

    if (removedRelationIds.length === 0) return;

    const updatedSchema = removeRelations(appState.schema, removedRelationIds);

    pushHistory(updatedSchema);
    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    dispatch({ type: 'CLEAR_SELECTION_BY_DELETION', payload: { relationIds: removedRelationIds } });
    postMessage('updateSchema', { schema: updatedSchema });
  }, [onEdgesChange, pushHistory, appState.schema, dispatch, postMessage]);

  const handleSaveSchema = useCallback(() => {
    postMessage('saveSchema', { schema: appState.schema });
    showToast('Схем хадгалагдлаа', 'success');
  }, [appState.schema, showToast, postMessage]);

  // ─── Keyboard shortcuts (after all handlers declared) ────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (appState.selectedEntityId) {
          const ent = appState.schema.entities.find((en) => en.id === appState.selectedEntityId);
          if (ent) {
            requestConfirmation(
              `"${ent.name}" entity-г устгахдаа итгэлтэй байна уу?`,
              'Холбоотой бүх relation-ууд мөн устана.',
              'Delete'
            ).then((confirmed) => {
              if (confirmed) {
                handleDeleteEntity(appState.selectedEntityId!);
              }
            });
          }
        } else if (appState.selectedRelationId) {
          const relId = appState.selectedRelationId;
          const rel = appState.schema.relations.find((r) => r.id === relId);
          if (rel) {
            requestConfirmation('Сонгосон relation-г устгахдаа итгэлтэй байна уу?', undefined, 'Delete').then((confirmed) => {
              if (confirmed) {
                handleDeleteRelation(relId);
              }
            });
          }
        }
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); handleSaveSchema(); }
        if (e.key === 'z') { e.preventDefault(); handleUndo(); }
        if (e.key === 'y') { e.preventDefault(); handleRedo(); }
        if (e.key === 'c') { e.preventDefault(); handleCopy(); }
        if (e.key === 'v') { e.preventDefault(); handlePaste(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState.selectedEntityId, appState.selectedRelationId, appState.schema, handleDeleteEntity, handleDeleteRelation, handleSaveSchema, handleUndo, handleRedo, handleCopy, handlePaste, requestConfirmation]);

  const handleGenerateCode = useCallback(() => {
    if (!getVscodeApi()?.postMessage) {
      showToast('VS Code API боломжгүй!', 'error');
      return;
    }
    postMessage('updateSchema', { schema: appState.schema });
    postMessage('generateCode', {});
    showToast(`${appState.schema.config.orm} код үүсгэгдлээ`, 'success');
  }, [appState.schema, showToast, postMessage, getVscodeApi]);

  const handleChangeOrm = useCallback((orm: OrmType) => {
    const updatedSchema = {
      ...appState.schema,
      config: {
        ...appState.schema.config,
        orm,
      },
    };
    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    pushHistory(updatedSchema);
    postMessage('updateSchema', { schema: updatedSchema });
  }, [appState.schema, dispatch, pushHistory, postMessage]);

  const handleChangeLanguage = useCallback((lang: TargetLanguage) => {
    const updatedSchema = {
      ...appState.schema,
      config: {
        ...appState.schema.config,
        targetLanguage: lang,
      },
    };
    dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
    pushHistory(updatedSchema);
    postMessage('updateSchema', { schema: updatedSchema });
  }, [appState.schema, dispatch, pushHistory, postMessage]);

  const handleExportXMI = useCallback(() => {
    if (!getVscodeApi()?.postMessage) {
      showToast('VS Code API боломжгүй!', 'error');
      return;
    }
    postMessage('updateSchema', { schema: appState.schema });
    postMessage('exportXMI', {});
    showToast('XMI файл экспорт хийгдлээ', 'success');
  }, [appState.schema, showToast, postMessage, getVscodeApi]);

  const handleImportSchema = useCallback(() => {
    if (!getVscodeApi()?.postMessage) {
      showToast('VS Code API боломжгүй!', 'error');
      return;
    }
    postMessage('importSchema', {});
  }, [showToast, postMessage, getVscodeApi]);

  const handleImportXMI = useCallback(() => {
    if (!getVscodeApi()?.postMessage) {
      showToast('VS Code API боломжгүй!', 'error');
      return;
    }
    postMessage('importXMI', {});
  }, [showToast, postMessage, getVscodeApi]);

  return (
    <div
      style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0b1220', color: '#e5e7eb' }}
    >
      <Toolbar
        onAddEntity={handleAddEntity}
        onSave={handleSaveSchema}
        onGenerateCode={handleGenerateCode}
        onImportSchema={handleImportSchema}
        onExportXMI={handleExportXMI}
        onImportXMI={handleImportXMI}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAutoLayout={handleAutoLayout}
        canUndo={canUndo}
        canRedo={canRedo}
        orm={appState.schema.config.orm}
        language={appState.schema.config.targetLanguage}
        onChangeOrm={handleChangeOrm}
        onChangeLanguage={handleChangeLanguage}
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div className="reactflow-wrapper" style={{ flex: 1, position: 'relative', minHeight: 0, minWidth: 0 }}>
          {showWelcome && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                backgroundColor: 'rgba(11, 18, 32, 0.96)',
              }}
            >
              <div style={{ textAlign: 'center', padding: '32px', maxWidth: '400px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', marginBottom: '16px' }}>
                  Welcome to UML to ORM
                </h2>
                <p style={{ color: '#94a3b8', marginBottom: '24px', lineHeight: 1.6 }}>
                  Визуал UML diagram ашиглан database schema-г зураад, автоматаар ORM код үүсгээрэй!
                </p>
                <button
                  onClick={handleAddEntity}
                  style={{
                    backgroundColor: '#1d4ed8',
                    color: '#fff',
                    padding: '12px 32px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  Create first entity
                </button>
                <div style={{ marginTop: '24px', fontSize: '13px', color: '#64748b' }}>
                  <p>Дараа нь:</p>
                  <p>• Attributes нэмэх</p>
                  <p>• Relationships холбох</p>
                  <p>• Code generate хийх</p>
                </div>
              </div>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            deleteKeyCode={null}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={handleNodeDragStop}
            onSelectionChange={handleSelectionChange}
            onInit={(instance: any) => { reactFlowRef.current = instance; }}
            onNodeClick={(_, node) => {
              dispatch({ type: 'SELECT_ENTITY', payload: node.id });
            }}
            onEdgeClick={handleEdgeClick}
            onPaneClick={() => {
              dispatch({ type: 'DESELECT_ALL' });
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            style={{ width: '100%', height: '100%' }}
          >
            <UmlMarkerDefs />
            <Background color="#334155" gap={24} size={1} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {(() => {
          const selectedRelation = appState.schema.relations.find((r) => r.id === appState.selectedRelationId);
          const selectedEntity = !selectedRelation
            ? appState.schema.entities.find((e) => e.id === appState.selectedEntityId) || null
            : null;

          // Hide panel when nothing is selected
          if (!selectedRelation && !selectedEntity) {
            return null;
          }
          return (
            <PropertyPanel
              entity={selectedEntity || undefined}
              relation={selectedRelation}
              entities={appState.schema.entities}
              onUpdate={(updatedEntity) => {
                const exists = appState.schema.entities.some((e) => e.id === updatedEntity.id);
                if (!exists) return;

                const updatedSchema = upsertEntity(appState.schema, updatedEntity);
                dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
                pushHistory(updatedSchema);
                postMessage('updateSchema', { schema: updatedSchema });
              }}
              onUpdateRelation={(updatedRelation) => {
                const exists = appState.schema.relations.some((r) => r.id === updatedRelation.id);
                if (!exists) return;

                const updatedSchema = upsertRelation(appState.schema, updatedRelation);
                dispatch({ type: 'SET_SCHEMA', payload: updatedSchema });
                pushHistory(updatedSchema);
                postMessage('updateSchema', { schema: updatedSchema });
              }}
              onDeleteRelation={(relationId) => {
                requestConfirmation('Энэ relation-г устгахдаа итгэлтэй байна уу?', undefined, 'Delete').then((confirmed) => {
                  if (confirmed) {
                    handleDeleteRelation(relationId);
                  }
                });

              }}
              onDelete={(entityId) => {
                const entity = appState.schema.entities.find((e) => e.id === entityId);
                const entityName = entity?.name || 'Энэ';
                requestConfirmation(
                  `"${entityName}" entity-г устгахдаа итгэлтэй байна уу?`,
                  'Холбоотой бүх relation-ууд мөн устана.',
                  'Delete'
                ).then((confirmed) => {
                  if (confirmed) {
                    handleDeleteEntity(entityId);
                  }
                });
              }}
            />
          );
        })()}
      </div>

      {/* ── Status Bar ── */}
      <div style={{
        padding: '4px 16px',
        backgroundColor: '#0f172a',
        borderTop: '1px solid #1f2937',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        fontSize: '12px',
        color: '#9ca3af',
        flexShrink: 0,
      }}>
        <span>{appState.schema.entities.length} entities</span>
        <span>{appState.schema.relations.length} relations</span>
        <span style={{ marginLeft: 'auto' }}>{appState.schema.config.orm} / {appState.schema.config.targetLanguage}</span>
      </div>

      {/* ── Toast Notifications ── */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '40px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 1000,
        }}>
          {toasts.map(toast => (
            <div
              key={toast.id}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                backgroundColor: toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#dc2626' : '#2563eb',
                animation: 'fadeIn 0.2s ease',
                minWidth: '200px',
              }}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DiagramEditor;
