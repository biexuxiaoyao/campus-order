import * as fs from 'fs';
import * as path from 'path';
import { Manifest, ManifestModule } from './types';

/** Known valid module IDs in the campus-order system. */
const KNOWN_MODULE_IDS = [
  'base',
  'group-meal',
  'prepaid',
  'discount',
  'points',
  'coupon',
  'printer',
  'push-notify',
];

/**
 * Read and validate a manifest JSON file.
 * Returns the parsed Manifest if valid. Throws on missing file, parse errors,
 * or validation failures.
 */
export function loadManifest(manifestPath: string): Manifest {
  const resolvedPath = path.resolve(manifestPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Manifest file not found: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  let manifest: unknown;

  try {
    manifest = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Failed to parse manifest JSON: ${err.message}`);
  }

  const errors = validateManifest(manifest as Manifest);
  if (errors.length > 0) {
    throw new Error(
      `Manifest validation failed:\n  - ${errors.join('\n  - ')}`
    );
  }

  // Resolve relative paths against the manifest's directory
  const baseDir = path.dirname(resolvedPath);
  const m = manifest as Manifest;
  m.targetDir = path.resolve(baseDir, m.targetDir);
  m.outputDir = path.resolve(baseDir, m.outputDir);

  return m;
}

/**
 * Validate a manifest object. Returns an array of human-readable error
 * strings. An empty array means the manifest is valid.
 */
export function validateManifest(m: Manifest): string[] {
  const errors: string[] = [];

  if (!m || typeof m !== 'object') {
    return ['Manifest must be a non-null object'];
  }

  // Required string fields
  for (const field of ['version', 'tenantId', 'watermarkId', 'targetDir', 'outputDir']) {
    if (typeof (m as any)[field] !== 'string' || (m as any)[field].trim() === '') {
      errors.push(`Missing or invalid required field: "${field}"`);
    }
  }

  // modules must be a non-empty array
  if (!Array.isArray(m.modules) || m.modules.length === 0) {
    errors.push('"modules" must be a non-empty array');
  } else {
    const seenIds = new Set<string>();
    m.modules.forEach((mod: ManifestModule, index: number) => {
      if (!mod.id || typeof mod.id !== 'string') {
        errors.push(`modules[${index}]: missing or invalid "id"`);
      } else {
        if (!KNOWN_MODULE_IDS.includes(mod.id)) {
          errors.push(
            `modules[${index}]: unknown module id "${mod.id}". Known ids: ${KNOWN_MODULE_IDS.join(', ')}`
          );
        }
        if (seenIds.has(mod.id)) {
          errors.push(`modules[${index}]: duplicate module id "${mod.id}"`);
        }
        seenIds.add(mod.id);
      }

      if (!mod.name || typeof mod.name !== 'string') {
        errors.push(`modules[${index}]: missing or invalid "name"`);
      }

      if (typeof mod.purchased !== 'boolean') {
        errors.push(`modules[${index}]: "purchased" must be a boolean`);
      }
    });
  }

  return errors;
}

/**
 * Map a module ID to the set of server source directories it occupies.
 * These directories live under <project>/src/.
 */
export function getModuleDirectories(moduleId: string): string[] {
  const MAP: Record<string, string[]> = {
    'group-meal': ['src/group-order/'],
    prepaid: ['src/prepaid/'],
    discount: ['src/discount/'],
    points: ['src/points/'],
    coupon: ['src/coupon/'],
    printer: ['src/printer/'],
    'push-notify': ['src/notify/'],
    base: [], // base module has no dedicated directory – it is the core
  };

  return MAP[moduleId] || [];
}
