import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PackagerOptions, DeliveryResult } from './types';
import { loadManifest } from './manifest';
import { stripModules } from './stripper';
import { injectWatermark } from './watermarker';

/**
 * Main orchestrator for the campus-order source code delivery packager.
 *
 * Processing pipeline:
 *   1. Load and validate the manifest JSON
 *   2. Copy the source tree to the output directory
 *   3. Strip directories and imports of unpurchased modules
 *   4. Inject watermark headers into all source files
 *   5. Compute a SHA-256 checksum of the output tree
 *   6. Return a DeliveryResult summary
 */
export async function packageDelivery(
  options: PackagerOptions
): Promise<DeliveryResult> {
  const errors: string[] = [];

  // ---- 1. Load & validate manifest ----------------------------------------
  let manifest;
  try {
    manifest = loadManifest(options.manifest);
  } catch (err: any) {
    return {
      success: false,
      tenantId: '',
      watermarkId: '',
      targetDir: '',
      outputDir: '',
      removedModules: [],
      removedFiles: 0,
      watermarkedFiles: 0,
      checksum: '',
      errors: [err.message],
    };
  }

  if (options.verbose) {
    console.log(`[packager] Manifest loaded: ${manifest.tenantId}`);
    console.log(`[packager] Target:  ${manifest.targetDir}`);
    console.log(`[packager] Output:  ${manifest.outputDir}`);
  }

  // ---- Dry-run: preview only (before any I/O) -------------------------------
  if (options.dryRun) {
    const unpurchased = manifest.modules
      .filter((m) => !m.purchased)
      .map((m) => m.id);

    console.log('\n--- DRY RUN ---');
    console.log(`Tenant:        ${manifest.tenantId}`);
    console.log(`Watermark:     ${manifest.watermarkId}`);
    console.log(`Target:        ${manifest.targetDir}`);
    console.log(`Output:        ${manifest.outputDir}`);
    console.log(`Modules:       ${manifest.modules.map((m) => `${m.id}=${m.purchased}`).join(', ')}`);
    console.log(`To remove:     ${unpurchased.length > 0 ? unpurchased.join(', ') : '(none)'}`);
    console.log('--- END DRY RUN ---\n');

    return {
      success: true,
      tenantId: manifest.tenantId,
      watermarkId: manifest.watermarkId,
      targetDir: manifest.targetDir,
      outputDir: manifest.outputDir,
      removedModules: unpurchased,
      removedFiles: 0,
      watermarkedFiles: 0,
      checksum: '',
      errors: [],
    };
  }

  // ---- 2. Validate target exists ------------------------------------------
  if (!fs.existsSync(manifest.targetDir)) {
    return {
      success: false,
      tenantId: manifest.tenantId,
      watermarkId: manifest.watermarkId,
      targetDir: manifest.targetDir,
      outputDir: manifest.outputDir,
      removedModules: [],
      removedFiles: 0,
      watermarkedFiles: 0,
      checksum: '',
      errors: [`Target directory does not exist: ${manifest.targetDir}`],
    };
  }

  // ---- 3. Clean output directory if it exists ------------------------------
  if (fs.existsSync(manifest.outputDir)) {
    fs.rmSync(manifest.outputDir, { recursive: true, force: true });
  }

  // ---- 4. Strip unpurchased modules ----------------------------------------
  let stripResult;
  try {
    stripResult = await stripModules(
      manifest.targetDir,
      manifest.outputDir,
      manifest.modules
    );

    if (options.verbose) {
      console.log(
        `[packager] Stripped modules: ${stripResult.removedModules.join(', ') || '(none)'}`
      );
      console.log(`[packager] Removed files:   ${stripResult.removedFiles}`);
    }
  } catch (err: any) {
    errors.push(`Module stripping failed: ${err.message}`);
    return {
      success: false,
      tenantId: manifest.tenantId,
      watermarkId: manifest.watermarkId,
      targetDir: manifest.targetDir,
      outputDir: manifest.outputDir,
      removedModules: [],
      removedFiles: 0,
      watermarkedFiles: 0,
      checksum: '',
      errors,
    };
  }

  // ---- 5. Inject watermarks ------------------------------------------------
  let watermarkedFiles = 0;
  try {
    watermarkedFiles = injectWatermark(manifest.outputDir, manifest);

    if (options.verbose) {
      console.log(`[packager] Watermarked files: ${watermarkedFiles}`);
    }
  } catch (err: any) {
    errors.push(`Watermark injection failed: ${err.message}`);
  }

  // ---- 6. Compute checksum of output ---------------------------------------
  const checksum = computeDirectoryChecksum(manifest.outputDir);

  if (options.verbose) {
    console.log(`[packager] Checksum (SHA-256): ${checksum}`);
  }

  // ---- 7. Assemble result --------------------------------------------------
  return {
    success: errors.length === 0,
    tenantId: manifest.tenantId,
    watermarkId: manifest.watermarkId,
    targetDir: manifest.targetDir,
    outputDir: manifest.outputDir,
    removedModules: stripResult.removedModules,
    removedFiles: stripResult.removedFiles,
    watermarkedFiles,
    checksum,
    errors,
  };
}

/**
 * Compute a deterministic SHA-256 hash over all files in a directory tree.
 * Files are sorted by relative path to ensure determinism.
 */
function computeDirectoryChecksum(dir: string): string {
  if (!fs.existsSync(dir)) {
    return '';
  }

  const hash = crypto.createHash('sha256');
  const files = collectFilesSorted(dir);

  for (const filePath of files) {
    const relPath = path.relative(dir, filePath).replace(/\\/g, '/');
    hash.update(relPath);
    hash.update('\0');
    const content = fs.readFileSync(filePath);
    hash.update(content);
    hash.update('\0');
  }

  return hash.digest('hex');
}

/**
 * Recursively collect all file paths in a directory, sorted by relative path.
 */
function collectFilesSorted(dir: string): string[] {
  const result: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    // Sort entries for deterministic ordering
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      // Skip node_modules, dist, .git
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }

  walk(dir);
  return result;
}
