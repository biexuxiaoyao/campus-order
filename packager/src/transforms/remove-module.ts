import * as fs from 'fs';
import * as path from 'path';
import { ManifestModule } from '../types';
import { getModuleDirectories } from '../manifest';

/**
 * jscodeshift-compatible transform that removes whole directories belonging
 * to modules that the customer has not purchased.
 *
 * This transform is NOT a pure jscodeshift file transform – it operates at
 * the directory level before the AST pass.  It is called manually by the
 * stripper with a list of module IDs to remove.
 */

export interface RemoveModuleOptions {
  /** Module IDs to remove (those with purchased === false). */
  moduleIds: string[];
  /** Root directory of the source project being processed. */
  sourceDir: string;
  /** Number of files removed. */
}

/**
 * Delete the directories for the given module IDs inside `sourceDir`.
 * Returns the total number of files (not directories) that were removed.
 */
export function removeModuleDirectories(
  moduleIds: string[],
  sourceDir: string
): { removedDirs: string[]; removedFileCount: number } {
  const removedDirs: string[] = [];
  let removedFileCount = 0;

  for (const moduleId of moduleIds) {
    const dirs = getModuleDirectories(moduleId);

    for (const relDir of dirs) {
      const absoluteDir = path.join(sourceDir, relDir);

      if (fs.existsSync(absoluteDir) && fs.statSync(absoluteDir).isDirectory()) {
        // Count files before removing
        const fileCount = countFilesRecursive(absoluteDir);
        removedFileCount += fileCount;

        // Remove the directory tree
        fs.rmSync(absoluteDir, { recursive: true, force: true });
        removedDirs.push(relDir);
      }
    }
  }

  return { removedDirs, removedFileCount };
}

/**
 * Recursively count the number of files inside a directory tree.
 */
function countFilesRecursive(dir: string): number {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(fullPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }

  return count;
}
