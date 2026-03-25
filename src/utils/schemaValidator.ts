import { ProjectSchema } from '../types/schema';

/**
 * Validates a schema for consistency and required fields
 */
export class SchemaValidator {
  validate(schema: ProjectSchema): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!schema.entities || schema.entities.length === 0) {
      errors.push({
        type: 'warning',
        message: 'Schema has no entities',
      });
    }

    // Validate entity names
    const entityNames = new Set<string>();
    for (const entity of schema.entities) {
      if (!entity.name || entity.name.trim() === '') {
        errors.push({
          type: 'error',
          message: `Entity ${entity.id} has no name`,
        });
      }

      if (entityNames.has(entity.name)) {
        errors.push({
          type: 'error',
          message: `Duplicate entity name: ${entity.name}`,
        });
      }
      entityNames.add(entity.name);

      // Validate attributes
      const attrNames = new Set<string>();
      let hasPrimaryKey = false;

      for (const attr of entity.attributes) {
        if (!attr.name || attr.name.trim() === '') {
          errors.push({
            type: 'error',
            message: `Entity ${entity.name} has an attribute with no name`,
          });
        }

        if (attrNames.has(attr.name)) {
          errors.push({
            type: 'error',
            message: `Entity ${entity.name} has duplicate attribute: ${attr.name}`,
          });
        }
        attrNames.add(attr.name);

        if (attr.isPrimary) hasPrimaryKey = true;
      }

      if (!hasPrimaryKey) {
        errors.push({
          type: 'warning',
          message: `Entity ${entity.name} has no primary key`,
        });
      }
    }

    // Validate relations
    for (const relation of schema.relations) {
      const sourceExists = schema.entities.some((e) => e.id === relation.sourceClassId);
      const targetExists = schema.entities.some((e) => e.id === relation.targetClassId);

      if (!sourceExists) {
        errors.push({
          type: 'error',
          message: `Relation ${relation.id} references non-existent source entity`,
        });
      }

      if (!targetExists) {
        errors.push({
          type: 'error',
          message: `Relation ${relation.id} references non-existent target entity`,
        });
      }
    }

    return errors;
  }
}

interface ValidationError {
  type: 'error' | 'warning';
  message: string;
}
