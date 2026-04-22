import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Attribute, Method, Visibility } from '../types/schema';

interface EntityNodeData {
  label: string;
  stereotype?: string;
  attributes: Attribute[];
  methods?: Method[];
  isAppSelected?: boolean;
  relationEndpoint?: 'source' | 'target' | 'both';
  onSelect?: () => void;
}

const visibilitySymbol = (v: Visibility): string => {
  switch (v) {
    case 'public': return '+';
    case 'private': return '−';
    case 'protected': return '#';
    case 'package': return '~';
    default: return '+';
  }
};

const sectionStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '12px',
  fontFamily: "'Consolas', 'Courier New', monospace",
  lineHeight: 1.6,
};

const HANDLE_STYLE: React.CSSProperties = {
  background: 'rgba(59, 130, 246, 0.18)',
  width: 14,
  height: 14,
  border: '1px solid rgba(15, 23, 42, 0.65)',
  borderRadius: '50%',
};

export const EntityNode: React.FC<NodeProps<EntityNodeData>> = ({ data, selected }) => {
  const stereotype = data.stereotype || 'entity';
  const isEntitySelected = selected || Boolean(data.isAppSelected);
  const relationEndpoint = data.relationEndpoint;
  const hasRelationFocus = Boolean(relationEndpoint);
  const relationBadgeText = relationEndpoint === 'source'
    ? 'SOURCE'
    : relationEndpoint === 'target'
      ? 'TARGET'
      : relationEndpoint === 'both'
        ? 'SOURCE + TARGET'
        : '';

  return (
    <div
      onClick={data.onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          data.onSelect?.();
        }
      }}
      style={{
        backgroundColor: '#0f172a',
        color: '#e5e7eb',
        borderRadius: '6px',
        border: isEntitySelected
          ? '2px solid #3b82f6'
          : hasRelationFocus
            ? '2px solid #f59e0b'
            : '1px solid #374151',
        minWidth: '220px',
        maxWidth: '320px',
        cursor: 'pointer',
        boxShadow: isEntitySelected
          ? '0 0 0 1px rgba(59, 130, 246, 0.25), 0 8px 18px rgba(37, 99, 235, 0.28)'
          : hasRelationFocus
            ? '0 0 0 1px rgba(245, 158, 11, 0.4), 0 8px 18px rgba(245, 158, 11, 0.22)'
            : '0 1px 4px rgba(0,0,0,0.25)',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        overflow: 'hidden',
        transition: 'border 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
        transform: hasRelationFocus ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {/* ──── Class Name Section ──── */}
      <div
        style={{
          backgroundColor: hasRelationFocus ? '#1f2937' : '#111827',
          padding: '10px 14px',
          textAlign: 'center',
          borderBottom: '1px solid #374151',
          position: 'relative',
        }}
      >
        {relationEndpoint && (
          <div
            style={{
              position: 'absolute',
              right: '8px',
              top: '8px',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#fef3c7',
              backgroundColor: 'rgba(217, 119, 6, 0.9)',
              border: '1px solid rgba(251, 191, 36, 0.85)',
              borderRadius: '999px',
              padding: '2px 6px',
              lineHeight: 1.2,
            }}
          >
            {relationBadgeText}
          </div>
        )}
        {stereotype && (
          <div
            style={{
              fontSize: '10px',
              color: '#9ca3af',
              letterSpacing: '0.5px',
              marginBottom: '2px',
            }}
          >
            &laquo;{stereotype}&raquo;
          </div>
        )}
        <div
          style={{
            fontWeight: 'bold',
            fontSize: '14px',
            color: '#f9fafb',
            letterSpacing: '0.3px',
          }}
        >
          {data.label}
        </div>
      </div>

      {/* ──── Attributes Section ──── */}
      <div
        style={{
          ...sectionStyle,
          borderBottom: '1px solid #1f2937',
          minHeight: '28px',
        }}
      >
        {data.attributes.length === 0 ? (
          <div style={{ color: '#475569', fontStyle: 'italic', fontSize: '11px', textAlign: 'center' }}>
            — no attributes —
          </div>
        ) : (
          data.attributes.map((attr) => (
            <div
              key={attr.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '1px 0',
                color: attr.isStatic ? '#c084fc' : '#e2e8f0',
                textDecoration: attr.isStatic ? 'underline' : 'none',
              }}
            >
              <span style={{ color: getVisibilityColor(attr.visibility), fontWeight: 'bold', width: '12px' }}>
                {visibilitySymbol(attr.visibility)}
              </span>
              <span>
                {attr.name}
              </span>
              <span style={{ color: '#64748b' }}>:</span>
              <span style={{ color: '#93c5fd' }}>{attr.type}</span>
              {attr.isPrimary && (
                <span style={{ color: '#fbbf24', fontSize: '10px', marginLeft: '2px' }} title="Primary Key">
                  PK
                </span>
              )}
              {attr.isUnique && !attr.isPrimary && (
                <span style={{ color: '#a78bfa', fontSize: '10px', marginLeft: '2px' }} title="Unique">
                  U
                </span>
              )}
              {!attr.isNullable && !attr.isPrimary && (
                <span style={{ color: '#f87171', fontSize: '10px', marginLeft: '2px' }} title="Not Null">
                  NN
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* ──── Methods Section ──── */}
      <div style={{ ...sectionStyle, minHeight: '24px' }}>
        {(!data.methods || data.methods.length === 0) ? (
          <div style={{ color: '#475569', fontStyle: 'italic', fontSize: '11px', textAlign: 'center' }}>
            — no methods —
          </div>
        ) : (
          data.methods.map((method) => (
            <div
              key={method.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '1px 0',
                color: method.isStatic ? '#c084fc' : '#e2e8f0',
                textDecoration: method.isStatic ? 'underline' : 'none',
                fontStyle: method.isAbstract ? 'italic' : 'normal',
              }}
            >
              <span style={{ color: getVisibilityColor(method.visibility), fontWeight: 'bold', width: '12px' }}>
                {visibilitySymbol(method.visibility)}
              </span>
              <span>
                {method.name}({method.parameters.map((p) => `${p.name}: ${p.type}`).join(', ')})
              </span>
              <span style={{ color: '#64748b' }}>:</span>
              <span style={{ color: '#93c5fd' }}>{method.returnType}</span>
            </div>
          ))
        )}
      </div>

      {/* Connection handles on all sides so edges can auto-route to the cleanest border */}
      <Handle id="target-top" type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle id="source-top" type="source" position={Position.Top} style={HANDLE_STYLE} />
      <Handle id="target-right" type="target" position={Position.Right} style={HANDLE_STYLE} />
      <Handle id="source-right" type="source" position={Position.Right} style={HANDLE_STYLE} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} style={HANDLE_STYLE} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} style={HANDLE_STYLE} />
      <Handle id="target-left" type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle id="source-left" type="source" position={Position.Left} style={HANDLE_STYLE} />
    </div>
  );
};

function getVisibilityColor(v: Visibility): string {
  switch (v) {
    case 'public': return '#4ade80';
    case 'private': return '#f87171';
    case 'protected': return '#fbbf24';
    case 'package': return '#60a5fa';
    default: return '#4ade80';
  }
}
