import { ProjectSchema } from '../../types/schema';
import { getRepositoryEntities, getRepositoryModelImportStem, getRepositoryPkName, getRepositoryPkType, getRepositoryRelationPlaceholders } from './common';
import { RepositoryGenerator } from '../repositoryGeneratorService';

export class DjangoRepositoryGenerator implements RepositoryGenerator {
  async generate(schema: ProjectSchema): Promise<string> {
    const entities = getRepositoryEntities(schema, 'Django');
    const importStem = getRepositoryModelImportStem(schema);
    const output: string[] = [];

    output.push(`"""Django repository helpers for ${schema.config.projectName || 'project'}."""`);
    output.push(`from __future__ import annotations`);
    output.push('');
    output.push(`from typing import Any`);
    if (entities.length > 0) {
      output.push(`from ${importStem} import ${entities.map((entity) => entity.name).join(', ')}`);
    }
    output.push('');

    for (const entity of entities) {
      const pkName = getRepositoryPkName(entity);
      const pkType = getRepositoryPkType(entity, 'py');
      const relationPlaceholders = getRepositoryRelationPlaceholders(entity, schema);

      output.push(`class ${entity.name}Repository:`);
      output.push(`    """Generated repository helper for ${entity.name}."""`);
      output.push('');
      output.push(`    def create(self, **data: Any) -> ${entity.name}:`);
      output.push(`        return ${entity.name}.objects.create(**data)`);
      output.push('');
      output.push(`    def get_by_id(self, ${pkName}: ${pkType}) -> ${entity.name} | None:`);
      output.push(`        return ${entity.name}.objects.filter(${pkName}=${pkName}).first()`);
      output.push('');
      output.push(`    def list(self):`);
      output.push(`        return ${entity.name}.objects.all()`);
      output.push('');
      output.push(`    def update(self, ${pkName}: ${pkType}, **data: Any) -> ${entity.name} | None:`);
      output.push(`        entity = self.get_by_id(${pkName})`);
      output.push(`        if entity is None:`);
      output.push(`            return None`);
      output.push(`        for key, value in data.items():`);
      output.push(`            setattr(entity, key, value)`);
      output.push(`        entity.save()`);
      output.push(`        return entity`);
      output.push('');
      output.push(`    def delete(self, ${pkName}: ${pkType}) -> bool:`);
      output.push(`        entity = self.get_by_id(${pkName})`);
      output.push(`        if entity is None:`);
      output.push(`            return False`);
      output.push(`        entity.delete()`);
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
