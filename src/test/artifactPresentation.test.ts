import * as assert from 'assert';
import { buildArtifactFilePlan, buildIssuePreview, describeParseConfidence, formatParseSummary } from '../shared/artifactPresentation';
import { ParseResult } from '../types/parsing';

suite('Artifact Presentation', () => {
  test('builds ORM and DDL artifact file names together', () => {
    const plan = buildArtifactFilePlan('blog', 'Prisma', 'PostgreSQL');

    assert.deepStrictEqual(plan, {
      ormFileName: 'blog_prisma_postgresql.prisma',
      ddlFileName: 'blog_ddl_postgresql.sql',
      repositoryFileName: 'blog_repository_postgresql.ts',
    });
  });

  test('classifies parse confidence into user-facing buckets', () => {
    assert.strictEqual(describeParseConfidence(0.9), 'өндөр');
    assert.strictEqual(describeParseConfidence(0.5), 'дунд');
    assert.strictEqual(describeParseConfidence(0.2), 'бага');
  });

  test('formats parse summaries and issue previews for diagnostics', () => {
    const parseResult: ParseResult = {
      schema: {
        version: '1.0',
        entities: [],
        relations: [],
        config: {
          targetLanguage: 'TypeScript',
          orm: 'Prisma',
          database: 'PostgreSQL',
        },
      },
      issues: [
        {
          severity: 'warning',
          code: 'PARTIAL_PARSE',
          message: 'Recovered only part of the model',
          recoverable: true,
          entityName: 'User',
        },
        {
          severity: 'error',
          code: 'PARSE_CONFIDENCE_LOW',
          message: 'Confidence too low',
          recoverable: true,
        },
      ],
      parserKind: 'prisma-dsl',
      detectedOrm: 'Prisma',
      detectedDatabase: 'PostgreSQL',
      confidence: 0.42,
    };

    const summary = formatParseSummary(parseResult);
    const preview = buildIssuePreview(parseResult.issues);

    assert.ok(summary.summary.includes('Prisma (PostgreSQL)'));
    assert.ok(summary.summary.includes('confidence 0.42 (дунд)'));
    assert.ok(summary.summary.includes('1 алдаа'));
    assert.ok(summary.detail.includes('Top issues:'));
    assert.deepStrictEqual(preview, [
      'PARTIAL_PARSE [User]: Recovered only part of the model',
      'PARSE_CONFIDENCE_LOW: Confidence too low',
    ]);
  });
});
