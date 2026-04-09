import { ProjectSchema } from '../../types/schema';
import { getRepositoryEntities, getRepositoryPkType, getRepositoryRelationPlaceholders } from './common';
import { RepositoryGenerator } from '../repositoryGeneratorService';

export class HibernateRepositoryGenerator implements RepositoryGenerator {
  async generate(schema: ProjectSchema): Promise<string> {
    const entities = getRepositoryEntities(schema, 'Hibernate');
    const packageName = schema.config.projectName ? this.toPackageName(schema.config.projectName) : 'com.example';
    const imports = new Set<string>(['org.springframework.data.jpa.repository.JpaRepository']);
    const output: string[] = [];

    for (const entity of entities) {
      imports.add(`${packageName}.model.${entity.name}`);
      const pkType = getRepositoryPkType(entity, 'java');
      if (pkType === 'LocalDateTime') {
        imports.add('java.time.LocalDateTime');
      }
      if (pkType === 'BigDecimal') {
        imports.add('java.math.BigDecimal');
      }
    }

    output.push(`package ${packageName}.repository;`);
    output.push('');
    Array.from(imports).sort().forEach((importValue) => output.push(`import ${importValue};`));
    output.push('');

    for (const entity of entities) {
      const pkType = getRepositoryPkType(entity, 'java');
      const relationPlaceholders = getRepositoryRelationPlaceholders(entity, schema);

      output.push(`public interface ${entity.name}Repository extends JpaRepository<${entity.name}, ${pkType}> {`);
      if (relationPlaceholders.length > 0) {
        output.push(`    // Related entity access placeholder: ${relationPlaceholders.join(', ')}`);
      }
      output.push(`}`);
      output.push('');
    }

    return output.join('\n').trim();
  }

  private toPackageName(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');
  }
}
