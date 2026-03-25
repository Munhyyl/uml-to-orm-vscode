declare module 'glob' {
  export function glob(pattern: string, options?: { cwd?: string }): Promise<string[]>;
}

declare module '*.css' {
  const cssText: string;
  export default cssText;
}
