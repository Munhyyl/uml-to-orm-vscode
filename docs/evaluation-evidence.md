# Evaluation Evidence Pack

## Purpose

This document defines the benchmark corpus, scoring rubric, and thesis-facing evidence used to evaluate the system beyond unit tests. It is intended to make the defense section reproducible and concrete.

## 1. Benchmark Corpus

### Schema A — Small Canonical CRUD Schema

- Source: [examples/simple-5-classes.orm.json](/home/munkh-orgil/Documents/uml-orm-refactor/examples/simple-5-classes.orm.json)
- Size: 5 entities
- Coverage:
  - basic entity modeling
  - one-to-many
  - many-to-many
  - `JSON`, `DateTime`, `Decimal`, `Bytes`
  - PostgreSQL/MySQL-specific output differences

### Schema B — Extended Relationship Schema

- Source: [examples/full-relationships-10-classes.orm.json](/home/munkh-orgil/Documents/uml-orm-refactor/examples/full-relationships-10-classes.orm.json)
- Size: 10 classes
- Coverage:
  - abstract class
  - inheritance-related modeling
  - multiple relation patterns
  - default values
  - denser graph layout and schema naming behavior

### Schema C — Reverse Parsing Stress Corpus

- Sources:
  - canonical generated files from `parserRoundTrip.test.ts`
  - partial handwritten snippets used for parser resilience
- Coverage:
  - recoverable syntax errors
  - parser confidence behavior
  - diagnostics-aware import
  - reverse parsing stability across all 5 ORM targets

## 2. Measurement Metrics

| Metric | Meaning | Evidence Source |
| ------ | ------- | --------------- |
| Task completion time | UML diagram to ORM/Repository/DDL artifacts хүртэл шаардагдах хугацаа | Manual benchmark session |
| Artifact completeness | ORM code, repository skeleton, DDL, relation metadata бүрэн гарсан эсэх | Generated outputs + rubric |
| Constraint coverage | PK, FK, unique, relation owner, naming rules зөв хадгалагдсан эсэх | Test suite + rubric |
| Database-specific correctness | PostgreSQL/MySQL mapping зөв ялгарсан эсэх | DDL + ORM generation outputs |
| Round-trip preservation rate | Generate → Parse → Normalize үед schema алдагдалгүй сэргэсэн хувь | `parserRoundTrip.test.ts` |
| Recoverable import rate | Partial/invalid input дээр crash хийхгүй сэргээгдсэн хувь | Parser resilience tests |
| Issue distribution | Error, warning, info diagnostics-ийн тархалт | `ParseResult` summary |

## 3. Correctness Rubric

Each benchmarked schema is scored across 7 dimensions:

| Criterion | Score |
| --------- | ----- |
| Primary key correctness | 0 / 0.5 / 1 |
| Foreign key correctness | 0 / 0.5 / 1 |
| Unique and constraint correctness | 0 / 0.5 / 1 |
| Relation owner and cardinality correctness | 0 / 0.5 / 1 |
| Field type correctness | 0 / 0.5 / 1 |
| Database-specific mapping correctness | 0 / 0.5 / 1 |
| DDL consistency with ORM output | 0 / 0.5 / 1 |

Interpretation:

- `1` = fully correct
- `0.5` = partially correct / recoverable mismatch
- `0` = incorrect or missing

Maximum score per schema: `7`

## 4. Existing Tool Comparison Criteria

The thesis comparison matrix should use the following fixed criteria:

| Criterion | Question |
| --------- | -------- |
| UML editor | Does the tool support visual modeling of class-level structures? |
| VS Code integration | Can the workflow remain inside the primary coding environment? |
| ORM generation | Can the tool generate ORM-oriented code artifacts directly? |
| Repository / DAO generation | Can the tool generate data access layer skeletons directly? |
| Reverse engineering | Can source code be imported back into a model? |
| XMI support | Can UML models be exported/imported via an OMG-aligned exchange format? |
| PostgreSQL/MySQL-aware output | Does the generated result reflect selected relational database differences? |
| DDL generation | Can SQL DDL artifacts be derived alongside higher-level code artifacts? |
| Diagnostics/confidence | Does the import process report recoverable issues and confidence instead of silent best-effort only? |
| Extensibility architecture | Is there an explicit adapter/profile/catalog architecture for adding new targets? |

## 5. Current Automated Evidence Summary

The current implementation already provides the following measurable evidence:

- `61 passing` automated tests in the local suite
- `5 passing` VS Code integration tests
- `5 ORM x 2 database = 10` canonical round-trip scenarios
- `100 entity` performance smoke scenario
- PostgreSQL/MySQL DDL generation verification
- ORM-specific repository generation verification
- diagnostics-aware import contract validation
- Node 20 baseline with successful VSIX packaging

## 6. Manual-vs-Tool Benchmark Worksheet

This worksheet is designed for the final defense rehearsal and thesis appendix.

| Schema | Workflow | Time (mm:ss) | Completeness Score / 7 | Notes |
| ------ | -------- | ------------ | ---------------------- | ----- |
| Schema A | Manual implementation | To collect | To collect | |
| Schema A | This system | To collect | To collect | |
| Schema B | Manual implementation | To collect | To collect | |
| Schema B | This system | To collect | To collect | |
| Schema C | Manual reverse reconstruction | To collect | To collect | |
| Schema C | This system | To collect | To collect | |

## 7. Threats To Validity

The thesis should explicitly acknowledge:

1. Manual timing data depends on evaluator familiarity with the target ORM.
2. Canonical generated code is easier to parse than arbitrary handwritten enterprise code.
3. The current corpus is representative but not exhaustive.
4. Performance evidence is measured on local development hardware and is environment-dependent.
5. User-facing VS Code interaction has smoke validation, but not a full UI automation matrix yet.
