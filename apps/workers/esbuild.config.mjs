import { build, context } from 'esbuild';

import { spawn } from 'node:child_process';

// Bundle the worker entry and the first-party @odb/* workspace sources into one
// plain-JS file so the runtime image needs no tsx and no TypeScript loader.
// Everything else stays external and resolves from node_modules at runtime:
// @temporalio/* carries core-bridge's prebuilt .node and drives its own swc +
// webpack workflow bundler, @datadog/pprof and friends ship native addons, and
// pino, @novu/node, @nangohq/node, nodemailer, resend and react-email resolve
// transports and templates by path in ways esbuild cannot safely inline.
const keepExternal = {
  name: 'external-non-first-party',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') {
        return null;
      }
      const first = args.path[0];
      if (first === '.' || first === '/') {
        return null;
      }
      if (args.path === '@odb' || args.path.startsWith('@odb/')) {
        return null;
      }
      return { path: args.path, external: true };
    });
  },
};

const options = {
  entryPoints: ['src/worker.ts'],
  outfile: 'dist/worker.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  plugins: [keepExternal],
};

// Dev mode restarts a plain `node dist/worker.js` after every rebuild. node
// --watch is avoided because it crashes Temporal's workflow worker threads
// (RangeError: Invalid atomic access index). The worker shares this process
// group, so Ctrl+C and run-dev's group SIGTERM stop both.
let worker;
const restartWorker = {
  name: 'restart-worker',
  setup(pluginBuild) {
    pluginBuild.onEnd(() => {
      worker?.kill();
      worker = spawn(process.execPath, ['dist/worker.js'], { stdio: 'inherit' });
    });
  },
};

if (process.argv.includes('--watch')) {
  const watcher = await context({
    ...options,
    plugins: [keepExternal, restartWorker],
  });
  await watcher.watch();
} else {
  await build(options);
}
