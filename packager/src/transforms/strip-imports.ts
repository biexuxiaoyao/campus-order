import { FileInfo, API } from 'jscodeshift';

/**
 * jscodeshift transform that removes import statements referencing deleted
 * module paths, and removes module registration entries in NestJS module
 * decorators (app.module.ts).
 *
 * Options (passed via jscodeshift's --transform-options or third argument):
 *   removedModules: string[]  – list of module IDs that were removed
 */

// Module ID → the NestJS module class name suffix pattern we should erase
const MODULE_CLASS_PATTERNS: Record<string, RegExp> = {
  'group-meal': /GroupOrderModule/i,
  prepaid: /PrepaidModule/i,
  discount: /DiscountModule/i,
  points: /PointsModule/i,
  coupon: /CouponModule/i,
  printer: /PrinterModule/i,
  'push-notify': /NotifyModule/i,
};

// Module ID → path fragments that appear in import specifiers
const MODULE_PATH_PATTERNS: Record<string, string[]> = {
  'group-meal': ['group-order', 'GroupOrder'],
  prepaid: ['prepaid', 'Prepaid'],
  discount: ['discount', 'Discount'],
  points: ['points', 'Points'],
  coupon: ['coupon', 'Coupon'],
  printer: ['printer', 'Printer'],
  'push-notify': ['notify', 'Notify'],
};

export default function transformer(
  file: FileInfo,
  api: API,
  options?: { removedModules?: string[] }
): string | null {
  const j = api.jscodeshift;
  const root = j(file.source);

  if (!options || !options.removedModules || options.removedModules.length === 0) {
    // Nothing to strip
    return file.source;
  }

  const { removedModules } = options;
  let modified = false;

  // 1. Remove import declarations that reference removed module paths
  root
    .find(j.ImportDeclaration)
    .filter((importPath) => {
      const source = importPath.node.source.value as string;
      return removedModules.some((modId) => {
        const patterns = MODULE_PATH_PATTERNS[modId];
        if (!patterns) return false;
        return patterns.some((fragment) => source.includes(fragment));
      });
    })
    .forEach((importPath) => {
      // Also check for named imports that import the module class
      const specifiersToRemove: any[] = [];

      if (importPath.node.specifiers) {
        importPath.node.specifiers.forEach((spec) => {
          if (spec.type === 'ImportSpecifier') {
            const importedName = spec.imported.name;
            const matchesRemovedModule = removedModules.some((modId) => {
              const clsPattern = MODULE_CLASS_PATTERNS[modId];
              return clsPattern && clsPattern.test(importedName);
            });
            if (matchesRemovedModule) {
              specifiersToRemove.push(spec);
            }
          }
        });
      }

      // If all specifiers would be removed, just remove the whole import
      if (
        specifiersToRemove.length > 0 &&
        importPath.node.specifiers &&
        specifiersToRemove.length === importPath.node.specifiers.length
      ) {
        j(importPath).remove();
        modified = true;
      }
    })
    // Also remove broad imports that just reference the module path (no named specifiers needed)
    .remove();

  // Second pass: remove imports where ALL specifiers belong to removed modules
  // (handles imports like `import { GroupOrderModule } from './group-order/...'`)
  root
    .find(j.ImportDeclaration)
    .filter((importPath) => {
      const source = importPath.node.source.value as string;
      return removedModules.some((modId) => {
        const patterns = MODULE_PATH_PATTERNS[modId];
        if (!patterns) return false;
        return patterns.some((fragment) => source.includes(fragment));
      });
    })
    .remove();
  modified = true; // we removed at least the ones from the first pass

  // 2. Remove module class references from @Module decorator arrays
  //    e.g. @Module({ imports: [GroupOrderModule, ...] })
  root
    .find(j.Decorator)
    .filter((dec) => {
      return (
        dec.node.expression.type === 'CallExpression' &&
        (dec.node.expression.callee as any).name === 'Module'
      );
    })
    .forEach((dec) => {
      const callExpr = dec.node.expression;
      if (callExpr.type !== 'CallExpression') return;

      const arg = callExpr.arguments[0];
      if (!arg || arg.type !== 'ObjectExpression') return;

      arg.properties.forEach((prop: any) => {
        if (
          prop.type === 'Property' ||
          prop.type === 'ObjectProperty'
        ) {
          const keyName =
            prop.key.type === 'Identifier'
              ? prop.key.name
              : prop.key.type === 'StringLiteral' || prop.key.type === 'Literal'
                ? prop.key.value
                : null;

          // NestJS @Module arrays: imports, exports, providers, controllers
          if (
            keyName &&
            ['imports', 'exports', 'providers', 'controllers'].includes(keyName) &&
            prop.value &&
            prop.value.type === 'ArrayExpression'
          ) {
            const filtered = prop.value.elements.filter((el: any) => {
              if (!el) return true; // preserve holes (unlikely)
              if (el.type === 'Identifier') {
                const match = removedModules.some((modId) => {
                  const pat = MODULE_CLASS_PATTERNS[modId];
                  return pat && pat.test(el.name);
                });
                return !match;
              }
              return true; // keep complex expressions
            });

            if (filtered.length !== prop.value.elements.length) {
              prop.value.elements = filtered;
              modified = true;
            }
          }
        }
      });
    });

  // 3. Remove route registrations in router files
  //    Pattern: `{ path: '/group-order', ... }` in route arrays
  root
    .find(j.ObjectExpression)
    .filter((objExpr) => {
      return objExpr.node.properties.some((prop: any) => {
        if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
          const keyName =
            prop.key.type === 'Identifier'
              ? prop.key.name
              : prop.key.type === 'StringLiteral' || prop.key.type === 'Literal'
                ? prop.key.value
                : null;
          if (keyName === 'path' || keyName === 'component') {
            const val = prop.value;
            if (val.type === 'StringLiteral' || val.type === 'Literal') {
              const strVal: string = val.value;
              return removedModules.some((modId) => {
                const patterns = MODULE_PATH_PATTERNS[modId];
                return patterns ? patterns.some((f) => strVal.includes(f)) : false;
              });
            }
          }
        }
        return false;
      });
    })
    .forEach((objExpr) => {
      // Find the parent array and remove this element
      const parent = objExpr.parent.node;
      if (parent.type === 'ArrayExpression') {
        const idx = parent.elements.indexOf(objExpr.node);
        if (idx !== -1) {
          parent.elements.splice(idx, 1);
          modified = true;
        }
      }
    });

  return modified ? root.toSource({ quote: 'single' }) : file.source;
}
