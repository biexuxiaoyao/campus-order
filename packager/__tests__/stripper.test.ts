import * as fs from 'fs';
import * as path from 'path';
import { validateManifest, loadManifest, getModuleDirectories } from '../src/manifest';
import { injectWatermark } from '../src/watermarker';
import { removeModuleDirectories } from '../src/transforms/remove-module';
import { Manifest } from '../src/types';

const FIXTURES = path.resolve(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------
describe('validateManifest', () => {
  test('accepts a valid manifest', () => {
    const m: Manifest = {
      version: '1.0.0',
      tenantId: 't-1',
      watermarkId: 'w-1',
      targetDir: './src',
      outputDir: './out',
      modules: [{ id: 'base', name: '基础模块', purchased: true }],
    };
    expect(validateManifest(m)).toEqual([]);
  });

  test('rejects missing required string fields', () => {
    const m = {
      version: '',
      tenantId: 'x',
      watermarkId: 'x',
      targetDir: 'x',
      outputDir: 'x',
      modules: [],
    } as any;
    const errors = validateManifest(m);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('version'))).toBe(true);
  });

  test('rejects missing modules array', () => {
    const m = {
      version: '1',
      tenantId: 't',
      watermarkId: 'w',
      targetDir: 'd',
      outputDir: 'o',
    } as any;
    const errors = validateManifest(m);
    expect(errors.some((e) => e.includes('modules'))).toBe(true);
  });

  test('rejects unknown module IDs', () => {
    const m: Manifest = {
      version: '1',
      tenantId: 't',
      watermarkId: 'w',
      targetDir: 'd',
      outputDir: 'o',
      modules: [{ id: 'fantasy-module', name: 'Fake', purchased: true }],
    };
    const errors = validateManifest(m);
    expect(errors.some((e) => e.includes('unknown module id'))).toBe(true);
  });

  test('rejects duplicate module IDs', () => {
    const m: Manifest = {
      version: '1',
      tenantId: 't',
      watermarkId: 'w',
      targetDir: 'd',
      outputDir: 'o',
      modules: [
        { id: 'base', name: '基础模块', purchased: true },
        { id: 'base', name: '基础模块 Dup', purchased: true },
      ],
    };
    const errors = validateManifest(m);
    expect(errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  test('rejects invalid purchased field', () => {
    const m: Manifest = {
      version: '1',
      tenantId: 't',
      watermarkId: 'w',
      targetDir: 'd',
      outputDir: 'o',
      modules: [{ id: 'base', name: '基础模块', purchased: 'yes' as any }],
    };
    const errors = validateManifest(m);
    expect(errors.some((e) => e.includes('purchased'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Module-to-directory mapping
// ---------------------------------------------------------------------------
describe('getModuleDirectories', () => {
  test('maps group-meal to src/group-order/', () => {
    expect(getModuleDirectories('group-meal')).toEqual(['src/group-order/']);
  });

  test('maps prepaid to src/prepaid/', () => {
    expect(getModuleDirectories('prepaid')).toEqual(['src/prepaid/']);
  });

  test('returns empty array for base module', () => {
    expect(getModuleDirectories('base')).toEqual([]);
  });

  test('returns empty array for unknown module', () => {
    expect(getModuleDirectories('unknown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Directory removal
// ---------------------------------------------------------------------------
describe('removeModuleDirectories', () => {
  const sandbox = path.resolve(FIXTURES, 'sandbox');

  beforeEach(() => {
    // Create a clean sandbox by copying sample-app
    if (fs.existsSync(sandbox)) {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
    copyDirSync(path.resolve(FIXTURES, 'sample-app'), sandbox);
  });

  afterEach(() => {
    if (fs.existsSync(sandbox)) {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('removes group-order directory when group-meal is removed', () => {
    const groupOrderDir = path.join(sandbox, 'src', 'group-order');
    expect(fs.existsSync(groupOrderDir)).toBe(true);

    const result = removeModuleDirectories(['group-meal'], sandbox);
    expect(result.removedDirs).toContain('src/group-order/');
    expect(fs.existsSync(groupOrderDir)).toBe(false);
    expect(result.removedFileCount).toBe(1); // group-order.module.ts
  });

  test('removes prepaid directory', () => {
    const prepaidDir = path.join(sandbox, 'src', 'prepaid');
    expect(fs.existsSync(prepaidDir)).toBe(true);

    const result = removeModuleDirectories(['prepaid'], sandbox);
    expect(result.removedDirs).toContain('src/prepaid/');
    expect(fs.existsSync(prepaidDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Watermark injection
// ---------------------------------------------------------------------------
describe('injectWatermark', () => {
  const sandbox = path.resolve(FIXTURES, 'sandbox-wm');

  beforeEach(() => {
    if (fs.existsSync(sandbox)) {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
    copyDirSync(path.resolve(FIXTURES, 'sample-app'), sandbox);
  });

  afterEach(() => {
    if (fs.existsSync(sandbox)) {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('injects watermark comment into .ts files', () => {
    const manifest: Manifest = {
      version: '1.0.0',
      tenantId: 'test-tenant',
      watermarkId: 'test-watermark',
      targetDir: '/tmp',
      outputDir: '/tmp',
      modules: [{ id: 'base', name: '基础模块', purchased: true }],
    };

    const count = injectWatermark(sandbox, manifest);
    expect(count).toBeGreaterThan(0);

    // Check that the app.module.ts now contains the watermark
    const appModulePath = path.join(sandbox, 'src', 'app.module.ts');
    const content = fs.readFileSync(appModulePath, 'utf-8');
    expect(content).toContain('@watermark test-watermark');
    expect(content).toContain('@tenant test-tenant');
  });

  test('does not watermark already-watermarked files', () => {
    const manifest: Manifest = {
      version: '1.0.0',
      tenantId: 't',
      watermarkId: 'w',
      targetDir: '/tmp',
      outputDir: '/tmp',
      modules: [{ id: 'base', name: '基础模块', purchased: true }],
    };

    injectWatermark(sandbox, manifest);
    const secondCount = injectWatermark(sandbox, manifest);
    // Second pass should not watermark any files (all already have watermark)
    expect(secondCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Jest config note
// ---------------------------------------------------------------------------
// This file uses ts-jest for TypeScript testing.
// If jest.config.js is not yet present, run:
//   npx ts-jest config:init
// or add the following to jest.config.js / jest.config.ts:
//
//   module.exports = {
//     preset: 'ts-jest',
//     testEnvironment: 'node',
//     roots: ['<rootDir>/__tests__'],
//   };
