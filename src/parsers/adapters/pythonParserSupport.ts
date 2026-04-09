import { parser } from '@lezer/python';

export interface PythonClassBlock {
  name: string;
  bases: string;
  body: string;
  start: number;
  end: number;
  bodyStart: number;
}

export function collectPythonClassBlocks(content: string): PythonClassBlock[] {
  const blocks: PythonClassBlock[] = [];
  const tree = parser.parse(content);

  tree.iterate({
    enter: (nodeRef) => {
      if (nodeRef.name !== 'ClassDefinition') {
        return;
      }
      const text = content.slice(nodeRef.from, nodeRef.to);
      const headerMatch = text.match(/^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/);
      if (!headerMatch) {
        return;
      }
      const lineBreak = text.indexOf('\n');
      const bodyStart = lineBreak >= 0 ? nodeRef.from + lineBreak + 1 : nodeRef.to;
      blocks.push({
        name: headerMatch[1],
        bases: headerMatch[2] || '',
        body: lineBreak >= 0 ? text.slice(lineBreak + 1) : '',
        start: nodeRef.from,
        end: nodeRef.to,
        bodyStart,
      });
    },
  });

  return blocks;
}
