import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
} from 'reactflow';
import { Relation } from '../types/schema';

interface UmlRelationEdgeData {
  relation: Relation;
}

interface EdgeVisuals {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  markerStart?: string;
  markerEnd?: string;
  centerLabel?: string;
}

const CENTER_LABEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  padding: '3px 8px',
  borderRadius: '999px',
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  border: '1px solid rgba(71, 85, 105, 0.9)',
  color: '#e2e8f0',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

const END_LABEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  padding: '1px 5px',
  borderRadius: '6px',
  backgroundColor: 'rgba(15, 23, 42, 0.86)',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 600,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

function getRelationVisuals(relation: Relation): EdgeVisuals {
  const umlType = relation.umlType || 'association';

  switch (umlType) {
    case 'aggregation':
      return {
        stroke: '#e2e8f0',
        strokeWidth: 2.2,
        markerStart: 'url(#uml-aggregation)',
      };
    case 'composition':
      return {
        stroke: '#f8fafc',
        strokeWidth: 2.5,
        markerStart: 'url(#uml-composition)',
      };
    case 'inheritance':
      return {
        stroke: '#f8fafc',
        strokeWidth: 2.2,
        markerEnd: 'url(#uml-inheritance)',
        centerLabel: 'extends',
      };
    case 'realization':
      return {
        stroke: '#e2e8f0',
        strokeWidth: 2,
        strokeDasharray: '10 6',
        markerEnd: 'url(#uml-realization)',
        centerLabel: 'implements',
      };
    case 'dependency':
      return {
        stroke: '#94a3b8',
        strokeWidth: 1.8,
        strokeDasharray: '8 6',
        markerEnd: 'url(#uml-dependency)',
        centerLabel: 'uses',
      };
    case 'association':
    default:
      return {
        stroke: '#cbd5e1',
        strokeWidth: 2,
      };
  }
}

function offsetTowards(fromX: number, fromY: number, toX: number, toY: number, distance: number) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: fromX + (dx / length) * distance,
    y: fromY + (dy / length) * distance,
  };
}

function renderEndLabel(x: number, y: number, text: string, key: string) {
  return (
    <div
      key={key}
      style={{
        ...END_LABEL_STYLE,
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
      }}
    >
      {text}
    </div>
  );
}

export const UmlRelationEdge: React.FC<EdgeProps<UmlRelationEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) => {
  const relation = data?.relation;

  if (!relation) {
    return null;
  }

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
    offset: 24,
  });

  const visuals = getRelationVisuals(relation);
  const sourceLabelPoint = offsetTowards(sourceX, sourceY, targetX, targetY, 26);
  const targetLabelPoint = offsetTowards(targetX, targetY, sourceX, sourceY, 26);
  const showMultiplicity = !['inheritance', 'realization', 'dependency'].includes(relation.umlType || 'association');
  const centerLabel = visuals.centerLabel || relation.documentation || '';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: visuals.stroke,
          strokeWidth: visuals.strokeWidth,
          strokeDasharray: visuals.strokeDasharray,
        }}
        markerStart={visuals.markerStart}
        markerEnd={visuals.markerEnd}
      />
      <EdgeLabelRenderer>
        <>
          {showMultiplicity && relation.sourceMultiplicity
            ? renderEndLabel(sourceLabelPoint.x, sourceLabelPoint.y - 14, relation.sourceMultiplicity, `${id}-source`)
            : null}
          {showMultiplicity && relation.targetMultiplicity
            ? renderEndLabel(targetLabelPoint.x, targetLabelPoint.y - 14, relation.targetMultiplicity, `${id}-target`)
            : null}
          {centerLabel ? (
            <div
              style={{
                ...CENTER_LABEL_STYLE,
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              }}
            >
              {centerLabel}
            </div>
          ) : null}
        </>
      </EdgeLabelRenderer>
    </>
  );
};

export const UmlMarkerDefs: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <defs>
      <marker id="uml-aggregation" viewBox="0 0 24 24" markerWidth="16" markerHeight="16" refX="12" refY="12" orient="auto-start-reverse">
        <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="#0b1220" stroke="#e2e8f0" strokeWidth="1.8" />
      </marker>
      <marker id="uml-composition" viewBox="0 0 24 24" markerWidth="16" markerHeight="16" refX="12" refY="12" orient="auto-start-reverse">
        <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="#f8fafc" stroke="#f8fafc" strokeWidth="1.4" />
      </marker>
      <marker id="uml-inheritance" viewBox="0 0 24 24" markerWidth="18" markerHeight="18" refX="21" refY="12" orient="auto">
        <path d="M2 12 L22 2 L22 22 Z" fill="#0b1220" stroke="#f8fafc" strokeWidth="1.8" />
      </marker>
      <marker id="uml-realization" viewBox="0 0 24 24" markerWidth="18" markerHeight="18" refX="21" refY="12" orient="auto">
        <path d="M2 12 L22 2 L22 22 Z" fill="#0b1220" stroke="#e2e8f0" strokeWidth="1.8" />
      </marker>
      <marker id="uml-dependency" viewBox="0 0 20 20" markerWidth="14" markerHeight="14" refX="18" refY="10" orient="auto">
        <path d="M2 10 L18 2 M2 10 L18 18" fill="none" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" />
      </marker>
    </defs>
  </svg>
);
