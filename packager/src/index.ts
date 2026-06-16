#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { packageDelivery } from './packager';

const program = new Command();

program
  .name('campus-packager')
  .description('Campus-Order source code delivery packager')
  .version('1.0.0')
  .requiredOption('-m, --manifest <path>', 'Path to manifest JSON')
  .option('-d, --dry-run', 'Preview without writing')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const result = await packageDelivery({
        manifest: options.manifest,
        dryRun: options.dryRun,
        verbose: options.verbose,
      });

      if (result.success) {
        console.log(chalk.green('\n=== Delivery packaging complete ==='));
      } else {
        console.log(chalk.red('\n=== Delivery packaging failed ==='));
      }

      console.log(JSON.stringify(result, null, 2));

      if (!result.success) {
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red(`\nFatal error: ${err.message}`));
      process.exit(1);
    }
  });

program.parse();
