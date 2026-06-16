import * as fs from 'fs';
import * as path from 'path';
import { ManifestModule } from './types';
import { removeModuleDirectories } from './transforms/remove-module';
import { globSync } from 'glob';

/**
 * Strip unpurchased modules from a source tree.
 *
 * Steps:
 * 1. Copy the entire sourceDir to outputDir (recursively).
 * 2. Identify modules where purchased === false.
 * 3. Delete their corresponding directories.
 * 4. Run the strip-imports transform on every remaining .ts/.js/.vue file
 *    to clean up any lingering import statements and module registrations.
 *
 * Returns a summary of what was removed.
 */
export interface StripResult {
  removedModules: string[];
  removedFiles: number;
}

export async function stripModules(
  sourceDir: string,
  outputDir: string,
  modules: ManifestModule[]
): Promise<StripResult> {
  // 1. Copy source → output
  copyDirectoryRecursive(sourceDir, outputDir);

  // 2. Determine which modules to remove
  const unpurchased = modules.filter((m) => m.purchased === false && m.id !== 'base');
  const moduleIds = unpurchased.map((m) => m.id);

  // 3. Delete directories for unpurchased modules
  const { removedFileCount } = removeModuleDirectories(moduleIds, outputDir);

  // 4. Strip import references from remaining files
  if (moduleIds.length > 0) {
    const sourceFiles = findSourceFiles(outputDir);

    for (const filePath of sourceFiles) {
      try {
        const originalContent = fs.readFileSync(filePath, 'utf-8');

        // Run jscodeshift on this single file with strip-imports transform
        const result = await runJscodeshiftOnFile(
          filePath,
          path.resolve(__dirname, 'transforms', 'strip-imports'),
          { removedModules: moduleIds }
        );

        if (result && result !== originalContent) {
          fs.writeFileSync(filePath, result, 'utf-8');
        }
      } catch (err: any) {
        // If jscodeshift fails on a file (e.g., parse error), skip it
        if (process.env.VERBOSE) {
          console.warn(`  [warn] Could not process ${filePath}: ${err.message}`);
        }
      }
    }
  }

  return {
    removedModules: moduleIds,
    removedFiles: removedFileCount,
  };
}

/**
 * Recursively copy a directory tree.
 */
function copyDirectoryRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip node_modules, dist, .git
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Find all source files in a directory tree (recursively).
 * Skips node_modules, dist, .git.
 */
function findSourceFiles(dir: string): string[] {
  const patterns = ['**/*.ts', '**/*.js', '**/*.vue'];
  const ignore = ['**/node_modules/**', '**/dist/**', '**/.git/**'];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = globSync(pattern, { cwd: dir, ignore, nodir: true, absolute: false });
    files.push(...matches.map((m) => path.join(dir, m)));
  }

  return files;
}

/**
 * Run jscodeshift programmatically on a single file using the specified
 * transform module.  Returns the transformed source string, or null on error.
 */
async function runJscodeshiftOnFile(
  filePath: string,
  transformPath: string,
  options: Record<string, any>
): Promise<string | null> {
  const jscodeshift = require('jscodeshift');

  // Read the source
  const source = fs.readFileSync(filePath, 'utf-8');

  // Call the transform directly
  const transformModule = require(transformPath);
  const transformFn = transformModule.default || transformModule;

  if (typeof transformFn !== 'function') {
    return source;
  }

  try {
    const api = {
      jscodeshift,
      j: jscodeshift,
      stats: () => {},
      report: () => {},
    };

    const fileInfo = {
      path: filePath,
      source,
    };

    const result = transformFn(fileInfo, api, options);
    return result ?? source;
  } catch {
    return source;
  }
}
