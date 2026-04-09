import { DataType, DatabaseType } from '../types/schema';

export interface PrismaDialectProfile {
  provider: string;
}

export interface TypeOrmDialectProfile {
  dataSourceType: string;
  columnOptionsByType: Record<DataType, string[]>;
}

export interface SQLAlchemyDialectProfile {
  engineUrlPrefix: string;
  sqlalchemyImports: string[];
  extraImports: string[];
  dataTypeByType: Record<DataType, string>;
}

export interface HibernateDialectProfile {
  columnDefinitionByType: Partial<Record<DataType, string>>;
}

export interface DjangoDialectProfile {
  engine: string;
}

const PRISMA_DIALECT_PROFILES: Record<DatabaseType, PrismaDialectProfile> = {
  PostgreSQL: {
    provider: 'postgresql',
  },
  MySQL: {
    provider: 'mysql',
  },
};

const TYPEORM_DIALECT_PROFILES: Record<DatabaseType, TypeOrmDialectProfile> = {
  PostgreSQL: {
    dataSourceType: 'postgres',
    columnOptionsByType: {
      String: [`type: 'varchar'`, 'length: 255'],
      Int: [`type: 'integer'`],
      Float: [`type: 'double precision'`],
      Boolean: [`type: 'boolean'`],
      DateTime: [`type: 'timestamp'`],
      JSON: [`type: 'jsonb'`],
      Bytes: [`type: 'bytea'`],
      Decimal: [`type: 'decimal'`, 'precision: 19', 'scale: 4'],
    },
  },
  MySQL: {
    dataSourceType: 'mysql',
    columnOptionsByType: {
      String: [`type: 'varchar'`, 'length: 255'],
      Int: [`type: 'int'`],
      Float: [`type: 'double'`],
      Boolean: [`type: 'boolean'`],
      DateTime: [`type: 'datetime'`],
      JSON: [`type: 'json'`],
      Bytes: [`type: 'blob'`],
      Decimal: [`type: 'decimal'`, 'precision: 19', 'scale: 4'],
    },
  },
};

const SQLALCHEMY_DIALECT_PROFILES: Record<DatabaseType, SQLAlchemyDialectProfile> = {
  PostgreSQL: {
    engineUrlPrefix: 'postgresql+psycopg',
    sqlalchemyImports: [
      'Column',
      'Integer',
      'String',
      'Boolean',
      'DateTime',
      'Float',
      'Numeric',
      'LargeBinary',
      'Text',
      'ForeignKey',
      'Table',
    ],
    extraImports: ['from sqlalchemy.dialects.postgresql import JSONB'],
    dataTypeByType: {
      String: 'String(255)',
      Int: 'Integer',
      Float: 'Float',
      Boolean: 'Boolean',
      DateTime: 'DateTime',
      JSON: 'JSONB',
      Bytes: 'LargeBinary',
      Decimal: 'Numeric',
    },
  },
  MySQL: {
    engineUrlPrefix: 'mysql+pymysql',
    sqlalchemyImports: [
      'Column',
      'Integer',
      'String',
      'Boolean',
      'DateTime',
      'Float',
      'Numeric',
      'LargeBinary',
      'Text',
      'ForeignKey',
      'Table',
      'JSON',
    ],
    extraImports: [],
    dataTypeByType: {
      String: 'String(255)',
      Int: 'Integer',
      Float: 'Float',
      Boolean: 'Boolean',
      DateTime: 'DateTime',
      JSON: 'JSON',
      Bytes: 'LargeBinary',
      Decimal: 'Numeric',
    },
  },
};

const HIBERNATE_DIALECT_PROFILES: Record<DatabaseType, HibernateDialectProfile> = {
  PostgreSQL: {
    columnDefinitionByType: {
      JSON: 'jsonb',
      DateTime: 'timestamp',
      Bytes: 'bytea',
      Decimal: 'numeric(19,4)',
    },
  },
  MySQL: {
    columnDefinitionByType: {
      JSON: 'json',
      DateTime: 'datetime(6)',
      Bytes: 'longblob',
      Decimal: 'decimal(19,4)',
    },
  },
};

const DJANGO_DIALECT_PROFILES: Record<DatabaseType, DjangoDialectProfile> = {
  PostgreSQL: {
    engine: 'django.db.backends.postgresql',
  },
  MySQL: {
    engine: 'django.db.backends.mysql',
  },
};

export function getPrismaDialectProfile(database: DatabaseType): PrismaDialectProfile {
  return PRISMA_DIALECT_PROFILES[database];
}

export function getTypeOrmDialectProfile(database: DatabaseType): TypeOrmDialectProfile {
  const profile = TYPEORM_DIALECT_PROFILES[database];
  return {
    ...profile,
    columnOptionsByType: Object.fromEntries(
      Object.entries(profile.columnOptionsByType).map(([type, options]) => [type, [...options]])
    ) as Record<DataType, string[]>,
  };
}

export function getSQLAlchemyDialectProfile(database: DatabaseType): SQLAlchemyDialectProfile {
  const profile = SQLALCHEMY_DIALECT_PROFILES[database];
  return {
    ...profile,
    sqlalchemyImports: [...profile.sqlalchemyImports],
    extraImports: [...profile.extraImports],
    dataTypeByType: { ...profile.dataTypeByType },
  };
}

export function getHibernateDialectProfile(database: DatabaseType): HibernateDialectProfile {
  const profile = HIBERNATE_DIALECT_PROFILES[database];
  return {
    ...profile,
    columnDefinitionByType: { ...profile.columnDefinitionByType },
  };
}

export function getDjangoDialectProfile(database: DatabaseType): DjangoDialectProfile {
  return DJANGO_DIALECT_PROFILES[database];
}
