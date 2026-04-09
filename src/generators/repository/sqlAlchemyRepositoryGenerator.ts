import { ProjectSchema } from '../../types/schema';
import { getRepositoryEntities, getRepositoryModelImportStem, getRepositoryPkName, getRepositoryPkType, getRepositoryRelationPlaceholders } from './common';
import { RepositoryGenerator } from '../repositoryGeneratorService';

export class SqlAlchemyRepositoryGenerator implements RepositoryGenerator {
  async generate(schema: ProjectSchema): Promise<string> {
    const entities = getRepositoryEntities(schema, 'SQLAlchemy');
    const importStem = getRepositoryModelImportStem(schema);
    const output: string[] = [];

    output.push(`"""SQLAlchemy repository skeletons for ${schema.config.projectName || 'project'}."""`);
    output.push(`from __future__ import annotations`);
    output.push('');
    output.push(`from typing import Any`);
    output.push(`from sqlalchemy.orm import Session`);
    if (entities.length > 0) {
      output.push(`from ${importStem} import ${entities.map((entity) => entity.name).join(', ')}`);
    }
    output.push('');

    for (const entity of entities) {
      const pkName = getRepositoryPkName(entity);
      const pkType = getRepositoryPkType(entity, 'py');
      const relationPlaceholders = getRepositoryRelationPlaceholders(entity, schema);

      output.push(`class ${entity.name}Repository:`);
      output.push(`    """Generated repository skeleton for ${entity.name}."""`);
      output.push('');
      output.push(`    def create(self, session: Session, data: dict[str, Any]) -> ${entity.name}:`);
      output.push(`        entity = ${entity.name}(**data)`);
      output.push(`        session.add(entity)`);
      output.push(`        return entity`);
      output.push('');
      output.push(`    def get_by_id(self, session: Session, ${pkName}: ${pkType}) -> ${entity.name} | None:`);
      output.push(`        return session.get(${entity.name}, ${pkName})`);
      output.push('');
      output.push(`    def list(self, session: Session) -> list[${entity.name}]:`);
      output.push(`        return session.query(${entity.name}).all()`);
      output.push('');
      output.push(`    def update(self, session: Session, ${pkName}: ${pkType}, data: dict[str, Any]) -> ${entity.name} | None:`);
      output.push(`        entity = self.get_by_id(session, ${pkName})`);
      output.push(`        if entity is None:`);
      output.push(`            return None`);
      output.push(`        for key, value in data.items():`);
      output.push(`            setattr(entity, key, value)`);
      output.push(`        return entity`);
      output.push('');
      output.push(`    def delete(self, session: Session, ${pkName}: ${pkType}) -> bool:`);
      output.push(`        entity = self.get_by_id(session, ${pkName})`);
      output.push(`        if entity is None:`);
      output.push(`            return False`);
      output.push(`        session.delete(entity)`);
      output.push(`        return True`);
      if (relationPlaceholders.length > 0) {
        output.push('');
        output.push(`    # Related entity access placeholder: ${relationPlaceholders.join(', ')}`);
      }
      output.push('');
    }

    return output.join('\n').trim();
  }
}
