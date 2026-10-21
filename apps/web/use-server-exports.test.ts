import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function isExported(node: ts.Node) {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

function isAsync(node: ts.Node) {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    )
  );
}

// Next lets a call such as enhanceAction(...) through and checks its result at
// runtime; the build fails only on values it can see are not async functions.
function isActionValue(node: ts.Expression | undefined) {
  return (
    node !== undefined &&
    (ts.isCallExpression(node) ||
      ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        isAsync(node)))
  );
}

function nonActionExports(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const [first] = file.statements;
  const isUseServer =
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use server';

  if (!isUseServer) {
    return [];
  }

  return file.statements.flatMap((statement): string[] => {
    if (ts.isExportAssignment(statement)) {
      return isActionValue(statement.expression) ? [] : ['default'];
    }
    if (!isExported(statement)) {
      return [];
    }
    if (ts.isFunctionDeclaration(statement)) {
      return isAsync(statement) ? [] : [statement.name?.text ?? 'default'];
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations
        .filter((declaration) => !isActionValue(declaration.initializer))
        .map((declaration) => declaration.name.getText(file));
    }
    if (ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      return [statement.name?.text ?? 'default'];
    }
    return [];
  });
}

describe('nonActionExports', () => {
  it('flags every export Next refuses in a "use server" file', () => {
    const source = `'use server';
export const NOT_ALLOWED = 'nope';
export const LIMITS = { max: 1 };
export function syncHelper() {}
export const syncArrow = () => 1;
export class Thing {}
export default 42;
`;

    expect(nonActionExports('actions.ts', source)).toEqual([
      'NOT_ALLOWED',
      'LIMITS',
      'syncHelper',
      'syncArrow',
      'Thing',
      'default',
    ]);
  });

  it('accepts async functions, wrapped actions, and type exports', () => {
    const source = `'use server';
export type Outcome = { ok: boolean };
export interface Input { id: string }
export async function save() {}
export const remove = async () => {};
export const update = enhanceAction(async () => {}, {});
export default async function act() {}
`;

    expect(nonActionExports('actions.ts', source)).toEqual([]);
  });

  it('ignores files without the directive', () => {
    expect(
      nonActionExports('types.ts', `export const NOT_ALLOWED = 'nope';`),
    ).toEqual([]);
  });
});

describe('"use server" files in the repo', () => {
  it('export only async functions and wrapped actions', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const files = globSync('{apps,packages}/**/*.{ts,tsx}', {
      cwd: root,
      exclude: (path) => /(^|\/)(node_modules|\.next|dist)$/.test(path),
    });

    const offenders = files.flatMap((file) =>
      nonActionExports(file, readFileSync(`${root}${file}`, 'utf8')).map(
        (name) => `${file}: ${name}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});
