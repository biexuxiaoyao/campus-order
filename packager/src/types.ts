export interface ManifestModule {
  id: string;           // module id: 'group-meal', 'prepaid', etc.
  name: string;
  purchased: boolean;
  expireAt?: string;
}

export interface Manifest {
  version: string;
  tenantId: string;
  watermarkId: string;
  modules: ManifestModule[];
  targetDir: string;    // source directory to process
  outputDir: string;    // output directory for processed code
  deliveredAt?: string;
  expiresAt?: string;
  checksum?: string;
}

export interface PackagerOptions {
  manifest: string;     // path to manifest JSON
  dryRun?: boolean;     // preview without writing
  verbose?: boolean;
}

export interface DeliveryResult {
  success: boolean;
  tenantId: string;
  watermarkId: string;
  targetDir: string;
  outputDir: string;
  removedModules: string[];
  removedFiles: number;
  watermarkedFiles: number;
  checksum: string;
  errors: string[];
}
