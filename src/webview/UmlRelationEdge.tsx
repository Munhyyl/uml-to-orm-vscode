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
  centerLabel?: string;
  startSymbol?: 'diamond-hollow' | 'diamond-filled';
  endSymbol?: 'triangle-hollow' | 'triangle-open' | 'arrow-open';
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
        startSymbol: 'diamond-hollow',
      };
    case 'composition':
      return {
        stroke: '#f8fafc',
        strokeWidth: 2.5,
        startSymbol: 'diamond-filled',
      };
    case 'inheritance':
      return {
        stroke: '#f8fafc',
        strokeWidth: 2.2,
        endSymbol: 'triangle-hollow',
        centerLabel: 'extends',
      };
    case 'realization':
      return {
        stroke: '#e2e8f0',
        strokeWidth: 2,
        strokeDasharray: '10 6',
        endSymbol: 'triangle-open',
        centerLabel: 'implements',
      };
    case 'dependency':
      return {
        stroke: '#94a3b8',
        strokeWidth: 1.8,
        strokeDasharray: '8 6',
        endSymbol: 'arrow-open',
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
        zIndex: 30,
      }}
    >
      {text}
    </div>
  );
}

function renderTerminalSymbol(
  symbol: EdgeVisuals['startSymbol'] | EdgeVisuals['endSymbol'],
  x: number,
  y: number,
  angle: number,
  key: string,
) {
  if (!symbol) {
    return null;
  }

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    width: '22px',
    height: '22px',
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${angle}deg)`,
    pointerEvents: 'none',
    zIndex: 35,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (symbol === 'diamond-hollow' || symbol === 'diamond-filled') {
    return (
      <div key={key} style={baseStyle}>
        <div
          style={{
            width: '12px',
            height: '12px',
            transform: 'rotate(45deg)',
            backgroundColor: symbol === 'diamond-filled' ? '#f8fafc' : '#0b1220',
            border: '2px solid #f8fafc',
            boxSizing: 'border-box',
          }}
        />
      </div>
    );
  }

  if (symbol === 'triangle-hollow' || symbol === 'triangle-open') {
    return (
      <div key={key} style={baseStyle}>
        <svg width="20" height="20" viewBox="0 0 20 20">
          <polygon
            points="2,10 18,2 18,18"
            fill="#0b1220"
            stroke="#f8fafc"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div key={key} style={baseStyle}>
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path d="M3 9 L15 3 M3 9 L15 15" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
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
  const sourceLabelPoint = offsetTowards(sourceX, sourceY, targetX, targetY, 44);
  const targetLabelPoint = offsetTowards(targetX, targetY, sourceX, sourceY, 44);
  const sourceSymbolPoint = offsetTowards(sourceX, sourceY, targetX, targetY, 18);
  const targetSymbolPoint = offsetTowards(targetX, targetY, sourceX, sourceY, 18);
  const angle = Math.atan2(targetY - sourceY, targetX - sourceX) * (180 / Math.PI);
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
      />
      <EdgeLabelRenderer>
        <>
          {renderTerminalSymbol(visuals.startSymbol, sourceSymbolPoint.x, sourceSymbolPoint.y, angle, `${id}-start-symbol`)}
          {renderTerminalSymbol(visuals.endSymbol, targetSymbolPoint.x, targetSymbolPoint.y, angle, `${id}-end-symbol`)}
          {showMultiplicity && relation.sourceMultiplicity
            ? renderEndLabel(sourceLabelPoint.x, sourceLabelPoint.y - 16, relation.sourceMultiplicity, `${id}-source`)
            : null}
          {showMultiplicity && relation.targetMultiplicity
            ? renderEndLabel(targetLabelPoint.x, targetLabelPoint.y - 16, relation.targetMultiplicity, `${id}-target`)
            : null}
          {centerLabel ? (
            <div
              style={{
                ...CENTER_LABEL_STYLE,
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                zIndex: 32,
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
