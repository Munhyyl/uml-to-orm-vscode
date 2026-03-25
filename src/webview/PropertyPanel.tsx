import React, { useState, useEffect, useRef } from 'react';
import { ClassEntity, Attribute, Method, DataType, Visibility, Relation, OnDeleteAction, UmlRelationType, deriveRelationType } from '../types/schema';
import { createAttribute, createMethod, isDataRelation as isUmlDataRelation, resolveOnDelete } from '../domain/schema/schemaOperations';

interface PropertyPanelProps {
  entity?: ClassEntity;
  relation?: Relation;
  entities?: ClassEntity[];
  onUpdate: (entity: ClassEntity) => void;
  onUpdateRelation?: (relation: Relation) => void;
  onDeleteRelation?: (relationId: string) => void;
  onDelete: (entityId: string) => void;
}

const DATA_TYPES: DataType[] = ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'JSON', 'Bytes', 'Decimal'];
const VISIBILITIES: Visibility[] = ['public', 'private', 'protected', 'package'];
const STEREOTYPES = ['entity', 'abstract', 'interface', 'enum', 'service', 'controller', 'repository'];
const UML_RELATION_TYPES: UmlRelationType[] = ['association', 'aggregation', 'composition', 'inheritance', 'realization', 'dependency'];
const ON_DELETE_ACTIONS: OnDeleteAction[] = ['Cascade', 'SetNull', 'Restrict', 'SetDefault'];

/** UML type descriptions for the dropdown */
const UML_TYPE_LABELS: Record<UmlRelationType, string> = {
  association: 'Association ───',
  aggregation: 'Aggregation ◇──',
  composition: 'Composition ◆──',
  inheritance: 'Inheritance ▷──',
  realization: 'Realization ▷╌╌',
  dependency:  'Dependency  ╌╌›',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#1e293b',
  border: '1px solid #475569',
  borderRadius: '4px',
  color: '#fff',
  padding: '6px 8px',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const smallSelectStyle: React.CSSProperties = {
  ...inputStyle,
  width: 'auto',
  minWidth: '70px',
  padding: '4px 6px',
  fontSize: '12px',
};

export const PropertyPanel: React.FC<PropertyPanelProps> = ({ entity, relation, entities, onUpdate, onUpdateRelation, onDeleteRelation, onDelete }) => {
  // ─── Entity state ───
  const [entityName, setEntityName] = useState(entity?.name || '');
  const [stereotype, setStereotype] = useState(entity?.stereotype || 'entity');
  const [documentation, setDocumentation] = useState(entity?.documentation || '');
  const [attributes, setAttributes] = useState<Attribute[]>(entity?.attributes || []);
  const [methods, setMethods] = useState<Method[]>(entity?.methods || []);

  // ─── Relation state (UML-first: ORM type is auto-derived) ───
  const [umlType, setUmlType] = useState<UmlRelationType>(relation?.umlType || 'association');
  const [srcMult, setSrcMult] = useState(relation?.sourceMultiplicity || '1');
  const [tgtMult, setTgtMult] = useState(relation?.targetMultiplicity || '*');
  const [srcField, setSrcField] = useState(relation?.sourceFieldName || '');
  const [tgtField, setTgtField] = useState(relation?.targetFieldName || '');
  const [onDeleteAction, setOnDeleteAction] = useState<OnDeleteAction | ''>(relation?.onDelete || '');
  const [relDoc, setRelDoc] = useState(relation?.documentation || '');

  // ─── Refs for auto-save (avoid stale closures) ───
  const entityRef = useRef(entity);
  entityRef.current = entity;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const relationRef = useRef(relation);
  relationRef.current = relation;
  const onUpdateRelationRef = useRef(onUpdateRelation);
  onUpdateRelationRef.current = onUpdateRelation;
  const skipEntityAutoSave = useRef(true);
  const pendingEntitySave = useRef<(() => void) | null>(null);
  const skipRelAutoSave = useRef(true);
  const pendingRelSave = useRef<(() => void) | null>(null);
  const entityAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relationAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Sync entity state from props (on entity selection change) ───
  useEffect(() => {
    pendingEntitySave.current?.();
    pendingEntitySave.current = null;
    if (entity) {
      setEntityName(entity.name);
      setStereotype(entity.stereotype || 'entity');
      setDocumentation(entity.documentation || '');
      setAttributes(entity.attributes);
      setMethods(entity.methods || []);
      skipEntityAutoSave.current = true;
    }
  }, [entity?.id]);

  // ─── Sync relation state from props (on relation selection change) ───
  useEffect(() => {
    pendingRelSave.current?.();
    pendingRelSave.current = null;
    if (relation) {
      setUmlType(relation.umlType || 'association');
      setSrcMult(relation.sourceMultiplicity || '1');
      setTgtMult(relation.targetMultiplicity || '*');
      setSrcField(relation.sourceFieldName || '');
      setTgtField(relation.targetFieldName || '');
      setOnDeleteAction(relation.onDelete || '');
      setRelDoc(relation.documentation || '');
      skipRelAutoSave.current = true;
    }
  }, [relation?.id]);

  // ─── Auto-save entity changes (debounced 300ms) ───
  useEffect(() => {
    if (!entity) return;
    if (skipEntityAutoSave.current) {
      skipEntityAutoSave.current = false;
      return;
    }
    const doSave = () => {
      onUpdateRef.current({
        ...entityRef.current!,
        name: entityName,
        stereotype,
        documentation: documentation || undefined,
        attributes,
        methods,
      });
      pendingEntitySave.current = null;
    };
    pendingEntitySave.current = doSave;
    entityAutoSaveTimer.current = setTimeout(doSave, 300);
    return () => {
      if (entityAutoSaveTimer.current) {
        clearTimeout(entityAutoSaveTimer.current);
        entityAutoSaveTimer.current = null;
      }
    };
  }, [entityName, stereotype, documentation, attributes, methods]);

  // ─── Auto-save relation changes (debounced 300ms) ───
  useEffect(() => {
    if (!relation || !onUpdateRelationRef.current) return;
    if (skipRelAutoSave.current) {
      skipRelAutoSave.current = false;
      return;
    }
    const isDataRel = isUmlDataRelation(umlType);
    const doSave = () => {
      const derivedType = deriveRelationType(umlType, srcMult, tgtMult);
      const nextRelation: Relation = {
        ...relationRef.current!,
        type: derivedType || 'OneToOne',
        umlType,
        sourceMultiplicity: isDataRel ? (srcMult || undefined) : undefined,
        targetMultiplicity: isDataRel ? (tgtMult || undefined) : undefined,
        sourceFieldName: isDataRel ? (srcField || undefined) : undefined,
        targetFieldName: isDataRel ? (tgtField || undefined) : undefined,
        onDelete: isDataRel ? (onDeleteAction || undefined) : undefined,
        documentation: relDoc || undefined,
      };
      onUpdateRelationRef.current!({
        ...nextRelation,
        onDelete: resolveOnDelete(nextRelation),
      });
      pendingRelSave.current = null;
    };
    pendingRelSave.current = doSave;
    relationAutoSaveTimer.current = setTimeout(doSave, 300);
    return () => {
      if (relationAutoSaveTimer.current) {
        clearTimeout(relationAutoSaveTimer.current);
        relationAutoSaveTimer.current = null;
      }
    };
  }, [umlType, srcMult, tgtMult, srcField, tgtField, onDeleteAction, relDoc]);
  const clearPendingSaves = () => {
    if (entityAutoSaveTimer.current) {
      clearTimeout(entityAutoSaveTimer.current);
      entityAutoSaveTimer.current = null;
    }
    if (relationAutoSaveTimer.current) {
      clearTimeout(relationAutoSaveTimer.current);
      relationAutoSaveTimer.current = null;
    }
    pendingEntitySave.current = null;
    pendingRelSave.current = null;
  };


  // ─── Attribute handlers ───
  const handleAddAttribute = () => {
    const newAttr = createAttribute();
    setAttributes([...attributes, newAttr]);
  };

  const handleRemoveAttribute = (id: string) => {
    setAttributes(attributes.filter((a) => a.id !== id));
  };

  const handleAttributeChange = (id: string, field: keyof Attribute, value: any) => {
    setAttributes(attributes.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };

  // ─── Method handlers ───
  const handleAddMethod = () => {
    const newMethod = createMethod();
    setMethods([...methods, newMethod]);
  };

  const handleRemoveMethod = (id: string) => {
    setMethods(methods.filter((m) => m.id !== id));
  };

  const handleMethodChange = (id: string, field: keyof Method, value: any) => {
    setMethods(methods.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleAddParameter = (methodId: string) => {
    setMethods(methods.map((m) =>
      m.id === methodId ? { ...m, parameters: [...m.parameters, { name: 'param', type: 'String' }] } : m
    ));
  };

  const handleRemoveParameter = (methodId: string, idx: number) => {
    setMethods(methods.map((m) =>
      m.id === methodId ? { ...m, parameters: m.parameters.filter((_, i) => i !== idx) } : m
    ));
  };

  const handleParameterChange = (methodId: string, idx: number, field: 'name' | 'type', value: string) => {
    setMethods(methods.map((m) =>
      m.id === methodId ? { ...m, parameters: m.parameters.map((p, i) => i === idx ? { ...p, [field]: value } : p) } : m
    ));
  };

  // Helper: is this a data relationship (has FK/multiplicity)?
  const isDataRelation = isUmlDataRelation(umlType);

  // ─── Relation Panel ───
  if (relation) {
    const srcEntity = entities?.find((e) => e.id === relation.sourceClassId);
    const tgtEntity = entities?.find((e) => e.id === relation.targetClassId);

    return (
      <div
        style={{
          width: '340px',
          minWidth: '340px',
          backgroundColor: '#1e293b',
          borderLeft: '2px solid #f59e0b',
          padding: '16px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          color: '#e2e8f0',
          gap: '12px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff', margin: 0, borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
          Relation Properties
        </h3>

        <div style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: '#334155', padding: '8px', borderRadius: '4px' }}>
          <strong>{srcEntity?.name || '?'}</strong> → <strong>{tgtEntity?.name || '?'}</strong>
        </div>

        {/* ── UML Relationship Type (primary) ── */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>UML Relationship</label>
          <select value={umlType} onChange={(e) => setUmlType(e.target.value as UmlRelationType)} style={inputStyle}>
            {UML_RELATION_TYPES.map((t) => (<option key={t} value={t}>{UML_TYPE_LABELS[t]}</option>))}
          </select>
        </div>

        {/* ── Derived ORM info (read-only) ── */}
        {isDataRelation && (
          <div style={{ fontSize: '11px', color: '#64748b', backgroundColor: '#0f172a', padding: '6px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
            ORM: {deriveRelationType(umlType, srcMult, tgtMult) || '—'}
            {umlType === 'composition' && ' (cascade delete)'}
          </div>
        )}

        {/* ── Multiplicity (only for data relations) ── */}
        {isDataRelation && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Source Multiplicity</label>
              <input type="text" placeholder="1" value={srcMult} onChange={(e) => setSrcMult(e.target.value)} style={inputStyle} />
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>1, 0..1, *, 1..*</div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Target Multiplicity</label>
              <input type="text" placeholder="*" value={tgtMult} onChange={(e) => setTgtMult(e.target.value)} style={inputStyle} />
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>1, 0..1, *, 1..*</div>
            </div>
          </div>
        )}

        {/* ── Field names (only for data relations) ── */}
        {isDataRelation && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Source Field</label>
              <input type="text" placeholder="fieldName" value={srcField} onChange={(e) => setSrcField(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Target Field</label>
              <input type="text" placeholder="fieldName" value={tgtField} onChange={(e) => setTgtField(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        {/* ── On Delete (only for data relations, auto Cascade for composition) ── */}
        {isDataRelation && (
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>On Delete</label>
            <select
              value={resolveOnDelete({ ...relation, umlType, onDelete: onDeleteAction || undefined, type: deriveRelationType(umlType, srcMult, tgtMult) || 'OneToOne', sourceMultiplicity: srcMult || undefined, targetMultiplicity: tgtMult || undefined }) || ''}
              onChange={(e) => setOnDeleteAction(e.target.value as OnDeleteAction)}
              disabled={umlType === 'composition'}
              style={{ ...inputStyle, opacity: umlType === 'composition' ? 0.6 : 1 }}
            >
              <option value="">— None —</option>
              {ON_DELETE_ACTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
            </select>
            {umlType === 'composition' && (
              <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px' }}>Composition → always Cascade</div>
            )}
          </div>
        )}

        {/* ── Structural relationship info ── */}
        {!isDataRelation && (
          <div style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: '#0f172a', padding: '10px', borderRadius: '4px', lineHeight: 1.6 }}>
            {umlType === 'inheritance' && 'Generates: class extends (Java/TS) or no ORM FK'}
            {umlType === 'realization' && 'Generates: class implements (Java/TS) or no ORM FK'}
            {umlType === 'dependency' && 'Structural dependency — no ORM/FK code generated'}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Documentation</label>
          <textarea
            value={relDoc}
            onChange={(e) => setRelDoc(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Describe this relationship..."
          />
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #334155' }}>
          <div style={{ fontSize: '11px', color: '#4ade80', textAlign: 'center', marginBottom: '8px' }}>✓ Auto-saved</div>
          <button onClick={() => {
            clearPendingSaves();
            onDeleteRelation?.(relation.id);
          }} style={{ width: '100%', backgroundColor: '#dc2626', color: '#fff', padding: '10px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  // ─── Entity Panel ───
  if (!entity) return null;

  return (
    <div
      style={{
        width: '340px',
        minWidth: '340px',
        backgroundColor: '#1e293b',
        borderLeft: '2px solid #60a5fa',
        padding: '16px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        color: '#e2e8f0',
        gap: '16px',
      }}
    >
      <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff', margin: 0, borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
        Class Properties
      </h3>

      {/* ── Class Name & Stereotype ── */}
      <div>
        <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Class Name</label>
        <input type="text" value={entityName} onChange={(e) => setEntityName(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Stereotype</label>
        <select value={stereotype} onChange={(e) => setStereotype(e.target.value)} style={inputStyle}>
          {STEREOTYPES.map((s) => (
            <option key={s} value={s}>«{s}»</option>
          ))}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Documentation</label>
        <textarea
          value={documentation}
          onChange={(e) => setDocumentation(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Describe this class..."
        />
      </div>

      {/* ── Attributes Section ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h4 style={{ fontWeight: 600, color: '#cbd5e1', fontSize: '13px', margin: 0 }}>Attributes</h4>
          <button onClick={handleAddAttribute} style={{ backgroundColor: '#3b82f6', color: '#fff', padding: '3px 10px', fontSize: '12px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
            + Add
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {attributes.length === 0 && (
            <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
              No attributes
            </div>
          )}
          {attributes.map((attr) => (
            <div key={attr.id} style={{ backgroundColor: '#334155', padding: '10px', borderRadius: '6px', border: '1px solid #475569' }}>
              {/* Row 1: visibility + name */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <select
                  value={attr.visibility}
                  onChange={(e) => handleAttributeChange(attr.id, 'visibility', e.target.value)}
                  style={{ ...smallSelectStyle, width: '75px' }}
                  title="Visibility"
                >
                  {VISIBILITIES.map((v) => (
                    <option key={v} value={v}>{v === 'public' ? '+' : v === 'private' ? '−' : v === 'protected' ? '#' : '~'} {v}</option>
                  ))}
                </select>
                <input type="text" placeholder="name" value={attr.name} onChange={(e) => handleAttributeChange(attr.id, 'name', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              </div>
              {/* Row 2: type + default value */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <select value={attr.type} onChange={(e) => handleAttributeChange(attr.id, 'type', e.target.value as DataType)} style={{ ...inputStyle, flex: 1 }}>
                  {DATA_TYPES.map((dt) => (<option key={dt} value={dt}>{dt}</option>))}
                </select>
                <input
                  type="text"
                  placeholder="default"
                  value={attr.defaultValue || ''}
                  onChange={(e) => handleAttributeChange(attr.id, 'defaultValue', e.target.value || undefined)}
                  style={{ ...inputStyle, flex: 1 }}
                  title="Default value"
                />
              </div>
              {/* Row 3: constraints */}
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', color: '#cbd5e1', cursor: 'pointer', gap: '4px' }}>
                  <input type="checkbox" checked={attr.isPrimary} onChange={(e) => handleAttributeChange(attr.id, 'isPrimary', e.target.checked)} />
                  PK
                </label>
                <label style={{ display: 'flex', alignItems: 'center', color: '#cbd5e1', cursor: 'pointer', gap: '4px' }}>
                  <input type="checkbox" checked={!attr.isNullable} onChange={(e) => handleAttributeChange(attr.id, 'isNullable', !e.target.checked)} />
                  NN
                </label>
                <label style={{ display: 'flex', alignItems: 'center', color: '#cbd5e1', cursor: 'pointer', gap: '4px' }}>
                  <input type="checkbox" checked={attr.isUnique} onChange={(e) => handleAttributeChange(attr.id, 'isUnique', e.target.checked)} />
                  UQ
                </label>
                <button onClick={() => handleRemoveAttribute(attr.id)} style={{ marginLeft: 'auto', backgroundColor: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
                  ✕ Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Methods Section ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h4 style={{ fontWeight: 600, color: '#cbd5e1', fontSize: '13px', margin: 0 }}>Methods</h4>
          <button onClick={handleAddMethod} style={{ backgroundColor: '#8b5cf6', color: '#fff', padding: '3px 10px', fontSize: '12px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
            + Add
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {methods.length === 0 && (
            <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
              No methods
            </div>
          )}
          {methods.map((method) => (
            <div key={method.id} style={{ backgroundColor: '#334155', padding: '10px', borderRadius: '6px', border: '1px solid #475569' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <select
                  value={method.visibility}
                  onChange={(e) => handleMethodChange(method.id, 'visibility', e.target.value)}
                  style={{ ...smallSelectStyle, width: '75px' }}
                >
                  {VISIBILITIES.map((v) => (
                    <option key={v} value={v}>{v === 'public' ? '+' : v === 'private' ? '−' : v === 'protected' ? '#' : '~'} {v}</option>
                  ))}
                </select>
                <input type="text" placeholder="methodName" value={method.name} onChange={(e) => handleMethodChange(method.id, 'name', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <input type="text" placeholder="return type" value={method.returnType} onChange={(e) => handleMethodChange(method.id, 'returnType', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              </div>

              {/* Parameters */}
              <div style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Parameters</span>
                  <button onClick={() => handleAddParameter(method.id)} style={{ backgroundColor: 'transparent', color: '#60a5fa', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
                    + param
                  </button>
                </div>
                {method.parameters.map((param, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '4px', marginBottom: '3px' }}>
                    <input
                      type="text"
                      placeholder="name"
                      value={param.name}
                      onChange={(e) => handleParameterChange(method.id, idx, 'name', e.target.value)}
                      style={{ ...inputStyle, flex: 1, padding: '3px 6px', fontSize: '11px' }}
                    />
                    <input
                      type="text"
                      placeholder="type"
                      value={param.type}
                      onChange={(e) => handleParameterChange(method.id, idx, 'type', e.target.value)}
                      style={{ ...inputStyle, flex: 1, padding: '3px 6px', fontSize: '11px' }}
                    />
                    <button onClick={() => handleRemoveParameter(method.id, idx)} style={{ backgroundColor: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: '10px', padding: '2px' }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '10px', fontSize: '11px' }}>
                <label style={{ display: 'flex', alignItems: 'center', color: '#cbd5e1', cursor: 'pointer', gap: '4px' }}>
                  <input type="checkbox" checked={method.isAbstract || false} onChange={(e) => handleMethodChange(method.id, 'isAbstract', e.target.checked)} />
                  abstract
                </label>
                <label style={{ display: 'flex', alignItems: 'center', color: '#cbd5e1', cursor: 'pointer', gap: '4px' }}>
                  <input type="checkbox" checked={method.isStatic || false} onChange={(e) => handleMethodChange(method.id, 'isStatic', e.target.checked)} />
                  static
                </label>
                <button onClick={() => handleRemoveMethod(method.id)} style={{ marginLeft: 'auto', backgroundColor: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
                  ✕ Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #334155' }}>
        <div style={{ fontSize: '11px', color: '#4ade80', textAlign: 'center', marginBottom: '8px' }}>✓ Auto-saved</div>
        <button onClick={() => {
          clearPendingSaves();
          onDelete(entity.id);
        }} style={{ width: '100%', backgroundColor: '#dc2626', color: '#fff', padding: '10px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
          Delete
        </button>
      </div>
    </div>
  );
};
