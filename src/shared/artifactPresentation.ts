import { buildDdlFileName, buildGeneratedFileName, buildRepositoryFileName } from './ormCatalog';
import { DatabaseType, OrmType } from '../types/schema';
import { Issue, ParseResult } from '../types/parsing';

export interface ArtifactFilePlan {
  ormFileName: string;
  ddlFileName: string;
  repositoryFileName: string;
}

export function buildArtifactFilePlan(projectName: string, orm: OrmType, database: DatabaseType): ArtifactFilePlan {
  return {
    ormFileName: buildGeneratedFileName(projectName, orm, database),
    ddlFileName: buildDdlFileName(projectName, database),
    repositoryFileName: buildRepositoryFileName(projectName, orm, database),
  };
}

export function describeParseConfidence(confidence: number): 'өндөр' | 'дунд' | 'бага' {
  if (confidence < 0.35) {
    return 'бага';
  }
  if (confidence < 0.6) {
    return 'дунд';
  }
  return 'өндөр';
}

export interface ParseSummary {
  summary: string;
  detail: string;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  confidence: number;
  confidenceLabel: 'өндөр' | 'дунд' | 'бага';
}

export function formatParseSummary(parseResult: ParseResult): ParseSummary {
  const errorCount = parseResult.issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = parseResult.issues.filter((issue) => issue.severity === 'warning').length;
  const infoCount = parseResult.issues.filter((issue) => issue.severity === 'info').length;
  const confidenceLabel = describeParseConfidence(parseResult.confidence);
  const summary = [
    `${parseResult.detectedOrm} (${parseResult.detectedDatabase})`,
    `${parseResult.parserKind}`,
    `confidence ${parseResult.confidence.toFixed(2)} (${confidenceLabel})`,
    `${errorCount} алдаа`,
    `${warningCount} анхааруулга`,
    `${infoCount} info`,
  ].join(', ');

  const preview = buildIssuePreview(parseResult.issues, 3);
  const detailParts = [
    `Parser: ${parseResult.parserKind}`,
    `Detected target: ${parseResult.detectedOrm} / ${parseResult.detectedDatabase}`,
    `Confidence: ${parseResult.confidence.toFixed(2)} (${confidenceLabel})`,
    `Issues: ${errorCount} errors, ${warningCount} warnings, ${infoCount} info`,
  ];
  if (preview.length > 0) {
    detailParts.push(`Top issues: ${preview.join(' | ')}`);
  }

  return {
    summary,
    detail: detailParts.join('\n'),
    errorCount,
    warningCount,
    infoCount,
    confidence: parseResult.confidence,
    confidenceLabel,
  };
}

export function describeParseConfidenceHint(confidenceLabel: 'өндөр' | 'дунд' | 'бага'): string {
  if (confidenceLabel === 'бага') {
    return 'Импорт дутуу сэргээгдсэн байж болзошгүй тул диаграмаа нягталж шалгана уу.';
  }
  if (confidenceLabel === 'дунд') {
    return 'Зарим entity болон холбоосыг гараар нягталж шалгах хэрэгтэй.';
  }
  return 'Гол бүтэц найдвартай сэргээгдсэн байна.';
}

export function buildImportNotificationMessage(summary: ParseSummary): string {
  const confidenceSummary = `Итгэлцэл: ${summary.confidenceLabel} (${summary.confidence.toFixed(2)})`;
  const issueSummary = `${summary.errorCount} алдаа, ${summary.warningCount} анхааруулга`;
  return `${confidenceSummary}. ${issueSummary}. ${describeParseConfidenceHint(summary.confidenceLabel)}`;
}

export function buildIssuePreview(issues: Issue[], limit = 3): string[] {
  return issues.slice(0, limit).map((issue) => {
    const entitySegment = issue.entityName ? ` [${issue.entityName}${issue.memberName ? `.${issue.memberName}` : ''}]` : '';
    return `${issue.code}${entitySegment}: ${issue.message}`;
  });
}
