import { ProjectSchema, ClassEntity, Attribute, Method } from '../../types/schema';
import { CodeGenerator } from '../codeGeneratorService';

export class HibernateGenerator implements CodeGenerator {
  async generate(schema: ProjectSchema): Promise<string> {
    if (schema.config.orm !== 'Hibernate') {
      throw new Error('This generator only supports Hibernate');
    }

    let output = '';

    // Generate enums first
    for (const entity of schema.entities) {
      if (entity.stereotype === 'enum') {
        output += this.generateJavaEnum(entity, schema);
        output += '\n\n// ' + '='.repeat(70) + '\n\n';
      }
    }

    for (const entity of schema.entities) {
      if (entity.stereotype === 'enum') continue;
      output += this.generateEntity(entity, schema);
      output += '\n\n// ' + '='.repeat(70) + '\n\n';
    }

    return output.trim();
  }

  private generateEntity(entity: ClassEntity, schema: ProjectSchema): string {
    const tableName = this.camelToSnake(entity.name);
    const imports = new Set<string>();

    // Core JPA imports
    imports.add('jakarta.persistence.*');

    // Lombok imports
    imports.add('lombok.Data');
    imports.add('lombok.NoArgsConstructor');
    imports.add('lombok.AllArgsConstructor');
    imports.add('lombok.Builder');

    // Check if we need specific imports
    const hasDateTime = entity.attributes.some((a) => a.type === 'DateTime');
    const hasDecimal = entity.attributes.some((a) => a.type === 'Decimal');
    const hasJson = entity.attributes.some((a) => a.type === 'JSON');
    const hasValidation = entity.attributes.some((a) => !a.isNullable || a.isUnique);

    if (hasDateTime) {
      imports.add('java.time.LocalDateTime');
      imports.add('org.hibernate.annotations.CreationTimestamp');
      imports.add('org.hibernate.annotations.UpdateTimestamp');
    }
    if (hasDecimal) {
      imports.add('java.math.BigDecimal');
    }
    if (hasJson) {
      imports.add('org.hibernate.annotations.JdbcTypeCode');
      imports.add('org.hibernate.type.SqlTypes');
    }
    if (hasValidation) {
      imports.add('jakarta.validation.constraints.NotNull');
      imports.add('jakarta.validation.constraints.NotBlank');
      imports.add('jakarta.validation.constraints.Size');
    }

    // Check relations
    const entityRelations = this.getEntityRelations(entity.id, schema);
    if (entityRelations.length > 0) {
      imports.add('java.util.List');
      imports.add('java.util.ArrayList');
      imports.add('lombok.ToString');
      imports.add('lombok.EqualsAndHashCode');
    }

    // Build code
    let code = `package ${schema.config.projectName ? this.toPackageName(schema.config.projectName) : 'com.example'}.model;\n\n`;

    // Sorted imports
    const sortedImports = Array.from(imports).sort();
    for (const imp of sortedImports) {
      code += `import ${imp};\n`;
    }
    code += '\n';

    // Documentation
    if (entity.documentation) {
      code += `/**\n * ${entity.documentation}\n */\n`;
    }

    // Inheritance / Realization
    const parentClass = this.getParentClass(entity.id, schema);
    const interfaces = this.getInterfaces(entity.id, schema);
    const isParent = schema.relations.some(
      (r) => r.umlType === 'inheritance' && r.targetClassId === entity.id
    );

    // Class annotations
    if (entity.stereotype === 'abstract') {
      code += `@MappedSuperclass\n`;
    } else {
      code += `@Entity\n`;
      code += `@Table(name = "${tableName}")\n`;
    }
    if (isParent) {
      code += `@Inheritance(strategy = InheritanceType.JOINED)\n`;
    }
    code += `@Data\n`;
    code += `@Builder\n`;
    code += `@NoArgsConstructor\n`;
    code += `@AllArgsConstructor\n`;

    if (entityRelations.length > 0) {
      code += `@ToString(exclude = {${entityRelations.map((r) => `"${r.fieldName}"`).join(', ')}})\n`;
      code += `@EqualsAndHashCode(exclude = {${entityRelations.map((r) => `"${r.fieldName}"`).join(', ')}})\n`;
    }

    // Build class declaration
    const isAbstract = entity.stereotype === 'abstract';
    const classModifier = isAbstract ? 'public abstract class' : 'public class';
    const extendsClause = parentClass ? ` extends ${parentClass.name}` : '';
    const implClause = interfaces.length > 0
      ? ` implements ${interfaces.map((i) => i.name).join(', ')}`
      : '';
    code += `${classModifier} ${entity.name}${extendsClause}${implClause} {\n\n`;

    // Fields
    for (const attr of entity.attributes) {
      code += this.generateField(attr);
    }

    // Relation fields
    for (const rel of entityRelations) {
      code += this.generateRelationField(rel);
    }

    // Methods
    if (entity.methods && entity.methods.length > 0) {
      code += '\n';
      for (const method of entity.methods) {
        code += this.generateMethod(method);
      }
    }

    code += `}\n`;
    return code;
  }

  private generateJavaEnum(entity: ClassEntity, schema: ProjectSchema): string {
    let code = `package ${schema.config.projectName ? this.toPackageName(schema.config.projectName) : 'com.example'}.model;\n\n`;
    if (entity.documentation) {
      code += `/**\n * ${entity.documentation}\n */\n`;
    }
    code += `public enum ${entity.name} {\n`;
    const values = entity.attributes.map((a) => `    ${a.name.toUpperCase()}`);
    code += values.join(',\n') + '\n';
    code += `}\n`;
    return code;
  }

  private generateMethod(method: Method): string {
    const vis = method.visibility === 'public' ? 'public' : method.visibility === 'protected' ? 'protected' : 'private';
    const stat = method.isStatic ? ' static' : '';
    const abs = method.isAbstract ? ' abstract' : '';
    const retType = method.returnType === 'void' ? 'void' : this.mapDataType(method.returnType) || method.returnType;
    const params = method.parameters.map((p) => `${this.mapDataType(p.type) || p.type} ${p.name}`).join(', ');

    let code = '';
    if (method.isAbstract) {
      code += `    ${vis}${stat}${abs} ${retType} ${method.name}(${params});\n\n`;
    } else {
      code += `    ${vis}${stat} ${retType} ${method.name}(${params}) {\n`;
      code += `        // TODO: implement\n`;
      code += `        throw new UnsupportedOperationException("Not implemented");\n`;
      code += `    }\n\n`;
    }
    return code;
  }

  private generateField(attr: Attribute): string {
    let code = '';
    const javaType = this.mapDataType(attr.type);
    const columnName = this.camelToSnake(attr.name);

    // Documentation
    if (attr.documentation) {
      code += `    /** ${attr.documentation} */\n`;
    }

    // Primary key
    if (attr.isPrimary) {
      code += `    @Id\n`;
      if (attr.type === 'Int') {
        code += `    @GeneratedValue(strategy = GenerationType.IDENTITY)\n`;
      } else {
        code += `    @GeneratedValue(strategy = GenerationType.UUID)\n`;
      }
      code += `    @Column(name = "${columnName}", updatable = false, nullable = false)\n`;
    } else {
      // Column annotation
      const columnProps: string[] = [];
      columnProps.push(`name = "${columnName}"`);

      if (!attr.isNullable) {
        columnProps.push('nullable = false');
      }
      if (attr.isUnique) {
        columnProps.push('unique = true');
      }
      if (attr.type === 'String') {
        columnProps.push('length = 255');
      }
      if (attr.type === 'Decimal') {
        columnProps.push('precision = 19');
        columnProps.push('scale = 4');
      }
      if (attr.defaultValue) {
        columnProps.push(`columnDefinition = "default ${attr.defaultValue}"`);
      }

      code += `    @Column(${columnProps.join(', ')})\n`;
    }

    // Validation annotations
    if (!attr.isPrimary) {
      if (!attr.isNullable) {
        if (attr.type === 'String') {
          code += `    @NotBlank(message = "${attr.name} is required")\n`;
          code += `    @Size(max = 255)\n`;
        } else {
          code += `    @NotNull(message = "${attr.name} is required")\n`;
        }
      }
    }

    // Type-specific annotations
    if (attr.type === 'JSON') {
      code += `    @JdbcTypeCode(SqlTypes.JSON)\n`;
    }

    if (attr.type === 'DateTime' && (attr.name.toLowerCase().includes('created') || attr.name.toLowerCase().includes('create'))) {
      code += `    @CreationTimestamp\n`;
    }
    if (attr.type === 'DateTime' && (attr.name.toLowerCase().includes('updated') || attr.name.toLowerCase().includes('update') || attr.name.toLowerCase().includes('modified'))) {
      code += `    @UpdateTimestamp\n`;
    }

    // Enumerated if needed
    if (attr.type === 'Bytes') {
      code += `    @Lob\n`;
    }

    code += `    private ${javaType} ${attr.name};\n\n`;
    return code;
  }

  private generateRelationField(rel: {
    fieldName: string;
    targetEntity: string;
    relationType: string;
    mappedBy?: string;
    isOwner: boolean;
    onDelete?: string;
  }): string {
    let code = '';

    const cascadeType = 'CascadeType.ALL';
    const fetchType = rel.relationType === 'ManyToMany' || rel.relationType === 'OneToMany'
      ? 'FetchType.LAZY'
      : 'FetchType.LAZY';

    switch (rel.relationType) {
      case 'OneToOne':
        if (rel.isOwner) {
          code += `    @OneToOne(fetch = ${fetchType}, cascade = ${cascadeType})\n`;
          code += `    @JoinColumn(name = "${this.camelToSnake(rel.fieldName)}_id", referencedColumnName = "id")\n`;
        } else {
          code += `    @OneToOne(mappedBy = "${rel.mappedBy}", fetch = ${fetchType})\n`;
        }
        code += `    private ${rel.targetEntity} ${rel.fieldName};\n\n`;
        break;

      case 'OneToMany':
        if (rel.isOwner) {
          // This side has the collection
          code += `    @OneToMany(mappedBy = "${rel.mappedBy || this.lowerFirst(rel.targetEntity)}", cascade = ${cascadeType}, orphanRemoval = true, fetch = ${fetchType})\n`;
          code += `    @Builder.Default\n`;
          code += `    private List<${rel.targetEntity}> ${rel.fieldName} = new ArrayList<>();\n\n`;
        } else {
          // ManyToOne side
          code += `    @ManyToOne(fetch = ${fetchType})\n`;
          code += `    @JoinColumn(name = "${this.camelToSnake(rel.fieldName)}_id", nullable = false)\n`;
          code += `    private ${rel.targetEntity} ${rel.fieldName};\n\n`;
        }
        break;

      case 'ManyToMany':
        if (rel.isOwner) {
          const joinTable = `${this.camelToSnake(rel.fieldName)}_mapping`;
          code += `    @ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE}, fetch = ${fetchType})\n`;
          code += `    @JoinTable(\n`;
          code += `        name = "${joinTable}",\n`;
          code += `        joinColumns = @JoinColumn(name = "${this.camelToSnake(rel.fieldName)}_id"),\n`;
          code += `        inverseJoinColumns = @JoinColumn(name = "${this.camelToSnake(rel.targetEntity)}_id")\n`;
          code += `    )\n`;
          code += `    @Builder.Default\n`;
          code += `    private List<${rel.targetEntity}> ${rel.fieldName} = new ArrayList<>();\n\n`;
        } else {
          code += `    @ManyToMany(mappedBy = "${rel.mappedBy}", fetch = ${fetchType})\n`;
          code += `    @Builder.Default\n`;
          code += `    private List<${rel.targetEntity}> ${rel.fieldName} = new ArrayList<>();\n\n`;
        }
        break;
    }

    return code;
  }

  private getParentClass(entityId: string, schema: ProjectSchema): ClassEntity | undefined {
    const inhRel = schema.relations.find(
      (r) => r.umlType === 'inheritance' && r.sourceClassId === entityId
    );
    return inhRel ? schema.entities.find((e) => e.id === inhRel.targetClassId) : undefined;
  }

  private getInterfaces(entityId: string, schema: ProjectSchema): ClassEntity[] {
    return schema.relations
      .filter((r) => r.umlType === 'realization' && r.sourceClassId === entityId)
      .map((r) => schema.entities.find((e) => e.id === r.targetClassId))
      .filter((e): e is ClassEntity => !!e);
  }

  private getEntityRelations(entityId: string, schema: ProjectSchema): Array<{
    fieldName: string;
    targetEntity: string;
    relationType: string;
    mappedBy?: string;
    isOwner: boolean;
    onDelete?: string;
  }> {
    const results: Array<{
      fieldName: string;
      targetEntity: string;
      relationType: string;
      mappedBy?: string;
      isOwner: boolean;
      onDelete?: string;
    }> = [];

    for (const rel of schema.relations) {
      // Skip structural UML relationships — no ORM mapping
      if (rel.umlType && ['inheritance', 'realization', 'dependency'].includes(rel.umlType)) continue;

      // Composition implies cascade delete
      const effectiveOnDelete = rel.umlType === 'composition' ? 'Cascade' : rel.onDelete;

      if (rel.sourceClassId === entityId) {
        const targetEntity = schema.entities.find((e) => e.id === rel.targetClassId);
        if (!targetEntity) continue;

        results.push({
          fieldName: rel.sourceFieldName || this.lowerFirst(targetEntity.name) + (rel.type !== 'OneToOne' ? 's' : ''),
          targetEntity: targetEntity.name,
          relationType: rel.type,
          isOwner: true,
          onDelete: effectiveOnDelete,
        });
      } else if (rel.targetClassId === entityId) {
        const sourceEntity = schema.entities.find((e) => e.id === rel.sourceClassId);
        if (!sourceEntity) continue;

        const reverseType = rel.type === 'OneToMany' ? 'OneToMany' : rel.type;
        results.push({
          fieldName: rel.targetFieldName || this.lowerFirst(sourceEntity.name) + (rel.type === 'OneToMany' ? '' : 's'),
          targetEntity: sourceEntity.name,
          relationType: reverseType,
          mappedBy: rel.sourceFieldName || this.lowerFirst(sourceEntity.name) + (rel.type !== 'OneToOne' ? 's' : ''),
          isOwner: rel.type === 'OneToMany', // reverse side: ManyToOne is the owner
          onDelete: effectiveOnDelete,
        });
      }
    }

    return results;
  }

  private mapDataType(type: string): string {
    const mapping: { [key: string]: string } = {
      String: 'String',
      Int: 'Long',
      Float: 'Double',
      Boolean: 'Boolean',
      DateTime: 'LocalDateTime',
      JSON: 'String',
      Bytes: 'byte[]',
      Decimal: 'BigDecimal',
    };
    return mapping[type] || 'String';
  }

  private camelToSnake(str: string): string {
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
      .toLowerCase();
  }

  private lowerFirst(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private toPackageName(name: string): string {
    return 'com.' + name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}
