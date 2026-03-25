import React from 'react';
import { OrmType, TargetLanguage } from '../types/schema';

// ORM-ууд хэлээс хамаарна
const ORM_BY_LANGUAGE: Record<TargetLanguage, OrmType[]> = {
  TypeScript: ['Prisma', 'TypeORM'],
  Python: ['SQLAlchemy', 'Django'],
  Java: ['Hibernate'],
};

const ALL_LANGUAGES: TargetLanguage[] = ['TypeScript', 'Python', 'Java'];

interface ToolbarProps {
  onAddEntity: () => void;
  onSave: () => void;
  onGenerateCode: () => void;
  onImportSchema: () => void;
  onExportXMI: () => void;
  onImportXMI: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  canUndo: boolean;
  canRedo: boolean;
  orm: OrmType;
  language: TargetLanguage;
  onChangeOrm: (orm: OrmType) => void;
  onChangeLanguage: (lang: TargetLanguage) => void;
}

const selectStyle: React.CSSProperties = {
  backgroundColor: '#111827',
  color: '#e5e7eb',
  border: '1px solid #374151',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '13px',
  cursor: 'pointer',
  outline: 'none',
};

export const Toolbar: React.FC<ToolbarProps> = ({
  onAddEntity,
  onSave,
  onGenerateCode,
  onImportSchema,
  onExportXMI,
  onImportXMI,
  onUndo,
  onRedo,
  onAutoLayout,
  canUndo,
  canRedo,
  orm,
  language,
  onChangeOrm,
  onChangeLanguage,
}) => {
  const availableOrms = ORM_BY_LANGUAGE[language] || [];
  const baseButton: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #374151',
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  };

  return (
    <div
      style={{
        backgroundColor: '#0f172a',
        borderBottom: '1px solid #1f2937',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onAddEntity}
          style={{ ...baseButton, backgroundColor: '#1d4ed8', borderColor: '#1d4ed8', color: '#ffffff', fontWeight: 600 }}
        >
          Add Entity
        </button>
        <div style={{ display: 'flex', gap: '2px', borderLeft: '1px solid #374151', paddingLeft: '8px', marginLeft: '4px' }}>
          <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ ...baseButton, borderRadius: '6px 0 0 6px', backgroundColor: canUndo ? '#1f2937' : '#111827', color: canUndo ? '#e5e7eb' : '#6b7280', cursor: canUndo ? 'pointer' : 'default', padding: '8px 10px' }}>Undo</button>
          <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{ ...baseButton, borderRadius: '0 6px 6px 0', backgroundColor: canRedo ? '#1f2937' : '#111827', color: canRedo ? '#e5e7eb' : '#6b7280', cursor: canRedo ? 'pointer' : 'default', padding: '8px 10px' }}>Redo</button>
        </div>
        <button onClick={onAutoLayout} title="Auto-layout" style={baseButton}>Auto Layout</button>
        <button
          onClick={onSave}
          style={{ ...baseButton, backgroundColor: '#047857', borderColor: '#047857', color: '#ffffff', fontWeight: 600 }}
        >
          Save
        </button>
        <button
          onClick={onGenerateCode}
          style={{ ...baseButton, backgroundColor: '#4f46e5', borderColor: '#4f46e5', color: '#ffffff', fontWeight: 600 }}
        >
          Generate Code
        </button>
        <button
          onClick={onImportSchema}
          style={{ ...baseButton, backgroundColor: '#0f766e', borderColor: '#0f766e', color: '#ffffff', fontWeight: 600 }}
        >
          Import Schema
        </button>
        <button
          onClick={onExportXMI}
          style={{ ...baseButton, backgroundColor: '#b45309', borderColor: '#b45309', color: '#ffffff', fontWeight: 600 }}
        >
          Export XMI
        </button>
        <button
          onClick={onImportXMI}
          style={{ ...baseButton, backgroundColor: '#7c3aed', borderColor: '#7c3aed', color: '#ffffff', fontWeight: 600 }}
        >
          Import XMI
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>Language</span>
          <select
            value={language}
            onChange={(e) => {
              const newLang = e.target.value as TargetLanguage;
              onChangeLanguage(newLang);
              // Автоматаар тухайн хэлний эхний ORM сонгох
              const newOrms = ORM_BY_LANGUAGE[newLang];
              if (newOrms && !newOrms.includes(orm)) {
                onChangeOrm(newOrms[0]);
              }
            }}
            style={selectStyle}
          >
            {ALL_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>ORM</span>
          <select
            value={orm}
            onChange={(e) => onChangeOrm(e.target.value as OrmType)}
            style={selectStyle}
          >
            {availableOrms.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
