import { FileInfo, API } from 'jscodeshift';

/**
 * jscodeshift transform that injects a watermark comment header into
 * every source file.  The watermark identifies the tenant, the delivery
 * date, and carries a licensing notice.
 *
 * Options:
 *   watermarkId: string
 *   tenantId:    string
 *   deliveredAt: string  (ISO date string)
 */

export interface InjectWatermarkOptions {
  watermarkId: string;
  tenantId: string;
  deliveredAt?: string;
}

export default function transformer(
  file: FileInfo,
  api: API,
  options?: InjectWatermarkOptions
): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  if (!options || !options.watermarkId || !options.tenantId) {
    return file.source;
  }

  const { watermarkId, tenantId, deliveredAt } = options;
  const dateStr = deliveredAt || new Date().toISOString().split('T')[0];

  const watermarkComment = j.commentBlock(
    `*\n * @watermark ${watermarkId}\n * @tenant ${tenantId}\n * @delivered ${dateStr}\n * This source code is licensed to the above tenant.\n * Unauthorized distribution is prohibited.\n `,
    true,  // leading = true (makes it a leading comment)
    false  // trailing = false
  );

  // Get the first node in the program body and attach the comment to it
  const body = root.get().node.program.body;
  if (body.length > 0) {
    // Attach as a leading comment to the first statement
    const firstNode = body[0];
    const existingComments = (firstNode as any).comments || [];
    (firstNode as any).comments = [watermarkComment, ...existingComments];
  } else {
    // Empty file – insert a bare comment (unusual for source but handled)
    return `/*\n * @watermark ${watermarkId}\n * @tenant ${tenantId}\n * @delivered ${dateStr}\n * This source code is licensed to the above tenant.\n * Unauthorized distribution is prohibited.\n */\n`;
  }

  return root.toSource({ quote: 'single' });
}
