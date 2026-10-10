import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Everything under src/ is shipped to the browser, where Node globals do not exist. A single
 * `process.env` read took the 3D canvas down in the client while every test and every Node
 * tool stayed green - the failure only showed up as "the model does not load", with no clue
 * beyond a reference error inside a bundled chunk. This guard is what makes that class of
 * bug fail here instead of on the phone.
 */
const NODE_ONLY = [
  { name: 'process', pattern: /\bprocess\s*[.[]/ },
  { name: 'require', pattern: /\brequire\s*\(/ },
  { name: '__dirname', pattern: /\b__dirname\b/ },
  { name: '__filename', pattern: /\b__filename\b/ },
  { name: 'Buffer', pattern: /\bBuffer\s*\./ },
  { name: 'global', pattern: /\bglobal\s*\./ },
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

/** Comments may talk about Node without using it; only code counts. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('browser safety', () => {
  const files = sourceFiles(resolve(process.cwd(), 'src'));

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never touches a Node global from a module the browser imports', () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = withoutComments(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, index) => {
        for (const { name, pattern } of NODE_ONLY) {
          if (pattern.test(line)) hits.push(`${relative(process.cwd(), file)}:${index + 1} uses ${name}: ${line.trim()}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});
