import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';
import { Manifest } from './types';

/**
 * Inject watermarks into every source file in the given directory tree.
 *
 * Walks all source files matching common extensions (.ts, .js, .vue, .json,
 * .scss, .css), skips node_modules/dist/.git, and adds a watermark comment
 * header identifying the tenant and delivery date.
 *
 * For package.json files, it also injects a `_watermark` field.
 *
 * Returns the count of files that were watermarked.
 */

const SOURCE_EXTENSIONS = '{ts,js,vue,json,scss,css}';
const SKIP_DIRS = ['node_modules', 'dist', '.git'];

export function injectWatermark(dir: string, manifest: Manifest): number {
  const { watermarkId, tenantId, deliveredAt } = manifest;
  const dateStr = deliveredAt || new Date().toISOString().split('T')[0];

  const pattern = `**/*.${SOURCE_EXTENSIONS}`;
  const ignorePatterns = SKIP_DIRS.map((d) => `**/${d}/**`);

  const files = globSync(pattern, {
    cwd: dir,
    ignore: ignorePatterns,
    nodir: true,
    absolute: false,
  });

  let watermarkedCount = 0;

  for (const relPath of files) {
    const filePath = path.join(dir, relPath);
    const ext = path.extname(relPath).toLowerCase();

    try {
      const originalContent = fs.readFileSync(filePath, 'utf-8');

      // Skip node_modules and dist inside nested projects too
      if (
        relPath.includes('node_modules') ||
        relPath.includes('/dist/') ||
        relPath.includes('\\.git\\')
      ) {
        continue;
      }

      let transformed: string;

      if (ext === '.json') {
        // For JSON files, inject a _watermark field at the top level
        transformed = injectJsonWatermark(originalContent, watermarkId, tenantId, dateStr);
      } else {
        // For TypeScript / JavaScript / Vue / SCSS / CSS – inject comment header
        transformed = injectCommentWatermark(originalContent, watermarkId, tenantId, dateStr, ext);
      }

      if (transformed !== originalContent) {
        fs.writeFileSync(filePath, transformed, 'utf-8');
        watermarkedCount++;
      }
    } catch {
      // Skip files that can't be processed
    }
  }

  return watermarkedCount;
}

/**
 * Prepend a block comment watermark to source code.
 */
function injectCommentWatermark(
  source: string,
  watermarkId: string,
  tenantId: string,
  dateStr: string,
  ext: string
): string {
  // Check if already watermarked
  if (source.includes('@watermark')) {
    return source;
  }

  const lines = [
    '/**',
    ` * @watermark ${watermarkId}`,
    ` * @tenant ${tenantId}`,
    ` * @delivered ${dateStr}`,
    ' * This source code is licensed to the above tenant.',
    ' * Unauthorized distribution is prohibited.',
    ' */',
    '',
  ];

  const header = lines.join('\n');
  return header + source;
}

/**
 * Inject a _watermark object into a JSON file.
 */
function injectJsonWatermark(
  source: string,
  watermarkId: string,
  tenantId: string,
  dateStr: string
): string {
  try {
    const obj = JSON.parse(source);

    // Already has a watermark
    if (obj._watermark) {
      return source;
    }

    obj._watermark = {
      id: watermarkId,
      tenant: tenantId,
      delivered: dateStr,
      notice: 'This source code is licensed to the above tenant. Unauthorized distribution is prohibited.',
    };

    return JSON.stringify(obj, null, 2) + '\n';
  } catch {
    // Not valid JSON – fall back to comment injection
    return injectCommentWatermark(source, watermarkId, tenantId, dateStr, '.json');
  }
}
