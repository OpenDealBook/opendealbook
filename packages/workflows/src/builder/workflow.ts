import {
  CancellationScope,
  condition,
  defineSignal,
  isCancellation,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type { Enums, Json } from '@odb/supabase';

import type * as activities from '../activities';
import type { LoopCarried, LoopGrant, StepResult } from './activities';
import type { StepOutputs } from './expressions';
import type { StepIo, WorkflowEdge, WorkflowNode } from './graph';
import { TEAM_UNLOCKED_SIGNAL } from './ids';

const {
  loadWorkflowRun,
  transitionWorkflowRun,
  executeWorkflowStep,
  failWorkflowStep,
  releaseLoopItems,
  isTeamLocked,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 5,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
  },
});

const { failWorkflowRun } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumInterval: '10 minutes',
  },
});

const LOCKED_RECHECK_INTERVAL = '1 hour';

function failureMessage(error: Error): string {
  return error.cause instanceof Error ? failureMessage(error.cause) : error.message;
}

const teamUnlockedSignal = defineSignal(TEAM_UNLOCKED_SIGNAL);

export interface RunPublishedWorkflowInput {
  runId: string;
}

interface Item {
  touched: boolean;
}

interface RootLoop {
  saved: boolean;
}

interface Scope {
  path: number[];
  failed: boolean;
  items: Item[];
  rootLoopId?: string;
  root?: RootLoop;
}

interface Claim {
  rootNodeId: string;
  units: {
    nodeId: string;
    context: LoopCarried['context'];
    items: { item: Json; path: string; tracker: Item }[];
  }[];
}

type Arrival = { from: string; output: StepIo; steps: StepOutputs } | 'skipped';

export async function runPublishedWorkflow({
  runId,
}: RunPublishedWorkflowInput): Promise<void> {
  const claims: Claim[] = [];
  let failed = false;
  let runCancelled = false;

  async function releaseUnprocessed(): Promise<void> {
    for (const claim of claims) {
      await releaseLoopItems({
        runId,
        rootNodeId: claim.rootNodeId,
        units: claim.units.map((unit) => ({
          nodeId: unit.nodeId,
          context: unit.context,
          items: unit.items
            .filter((entry) => !entry.tracker.touched)
            .map(({ item, path }) => ({ item, path })),
        })),
      });
    }
  }

  try {
    const loaded = await loadWorkflowRun({ runId });
    if (loaded.kind === 'refused') {
      return;
    }
    const { accountId, triggerNodeId, graph } = loaded;
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const arrivals = new Map<string, Map<string, Arrival>>();
    const reachable = new Set([triggerNodeId]);
    for (const id of reachable) {
      for (const edge of graph.edges.filter((candidate) => candidate.sourceNodeId === id)) {
        reachable.add(edge.targetNodeId);
      }
    }
    let status: Enums<'workflow_run_status'> = 'running';
    let statusChange = Promise.resolve();
    let working = 0;
    let waiting = 0;
    let lockPaused = false;
    let unlockSignalled = false;
    let lockCheck: Promise<void> | undefined;

    setHandler(teamUnlockedSignal, () => {
      unlockSignalled = true;
    });

    const reconcileStatus = (): Promise<void> => {
      statusChange = statusChange.then(async () => {
        const to = lockPaused
          ? 'paused_locked'
          : working === 0 && waiting > 0
            ? 'waiting'
            : 'running';
        if (to !== status) {
          await transitionWorkflowRun({ runId, from: status, to });
          status = to;
        }
      });
      return statusChange;
    };

    const waitUntilUnlocked = async (): Promise<void> => {
      if (!(await isTeamLocked({ accountId }))) {
        return;
      }
      lockPaused = true;
      await reconcileStatus();
      do {
        unlockSignalled = false;
        await condition(() => unlockSignalled, LOCKED_RECHECK_INTERVAL);
      } while (await isTeamLocked({ accountId }));
      lockPaused = false;
      await reconcileStatus();
    };

    const sharedLockCheck = (): Promise<void> => {
      lockCheck ??= waitUntilUnlocked().finally(() => {
        lockCheck = undefined;
      });
      return lockCheck;
    };

    const edgesFrom = (nodeId: string, handle?: string): WorkflowEdge[] =>
      graph.edges.filter(
        (edge) =>
          edge.sourceNodeId === nodeId &&
          (handle === undefined || edge.sourceHandle === handle),
      );

    const follow = async (
      edges: WorkflowEdge[],
      scope: Scope,
      arrivalFor: (edge: WorkflowEdge) => Arrival,
    ): Promise<void> => {
      await Promise.all(edges.map((edge) => deliver(edge, arrivalFor(edge), scope)));
    };

    const deliver = async (edge: WorkflowEdge, arrival: Arrival, scope: Scope): Promise<void> => {
      const node = nodes.get(edge.targetNodeId)!;
      const key = `${node.id}:${scope.path.join('.')}`;
      const received = (arrivals.get(key) ?? new Map<string, Arrival>()).set(edge.id, arrival);
      arrivals.set(key, received);
      const expected = graph.edges.filter(
        (candidate) => candidate.targetNodeId === node.id && reachable.has(candidate.sourceNodeId),
      );
      if (received.size < expected.length) {
        return;
      }
      arrivals.delete(key);
      const came = [...received.values()].filter((each) => each !== 'skipped');
      if (came.length === 0) {
        return follow(edgesFrom(node.id), scope, () => 'skipped');
      }
      const input =
        node.type === 'merge'
          ? Object.fromEntries(came.map((each) => [each.from, each.output]))
          : came[0]!.output;
      return run(node, input, Object.assign({}, ...came.map((each) => each.steps)), scope);
    };

    const execute = async (
      node: WorkflowNode,
      input: StepIo,
      steps: StepOutputs,
      scope: Scope,
    ): Promise<StepResult | undefined> => {
      for (const item of scope.items) {
        item.touched = true;
      }
      const execution = { runId, accountId, node, iterationPath: scope.path };
      const result = await executeWorkflowStep({
        ...execution,
        input,
        steps,
        rootLoopId: scope.rootLoopId,
      }).catch(async (error: Error) => {
        failed = true;
        scope.failed = true;
        await failWorkflowStep({ ...execution, error: failureMessage(error) });
        return undefined;
      });
      if (result?.kind === 'run_cancelled') {
        runCancelled = true;
      }
      return result;
    };

    const run = async (
      node: WorkflowNode,
      input: StepIo,
      steps: StepOutputs,
      scope: Scope,
    ): Promise<void> => {
      if (runCancelled) {
        return;
      }
      working += 1;
      await sharedLockCheck();
      let result = await execute(node, input, steps, scope);
      while (result?.kind === 'waiting') {
        working -= 1;
        waiting += 1;
        await reconcileStatus();
        await sleep(Math.max(0, Date.parse(result.until) - Date.now()));
        waiting -= 1;
        working += 1;
        await reconcileStatus();
        result = await execute(node, input, steps, scope);
      }
      working -= 1;

      if (result?.kind !== 'succeeded') {
        await reconcileStatus();
        return;
      }
      const { output, handle, loop } = result;
      const reached = { ...steps, [node.id]: output };
      const next = loop
        ? runLoop(node, output, loop, reached, scope)
        : follow(edgesFrom(node.id), scope, (edge) =>
            node.type === 'branch' && edge.sourceHandle !== handle
              ? 'skipped'
              : { from: node.id, output, steps: reached },
          );
      await Promise.all([next, reconcileStatus()]);
    };

    const iterate = async (
      loopNode: WorkflowNode,
      entries: { item: Json; index: number; tracker: Item }[],
      steps: StepOutputs,
      scope: Scope,
      root: RootLoop,
      pathOf: (index: number) => number[],
    ): Promise<boolean> => {
      const iterations = entries.map(({ item, index, tracker }) => ({
        scope: {
          path: pathOf(index),
          failed: false,
          items: [...scope.items, tracker],
          rootLoopId: scope.rootLoopId ?? loopNode.id,
          root,
        },
        io: { item, index },
      }));
      const runIteration = ({ scope: inner, io }: (typeof iterations)[number]) =>
        follow(edgesFrom(loopNode.id, 'each'), inner, () => ({
          from: loopNode.id,
          output: io,
          steps: { ...steps, [loopNode.id]: io },
        }));

      if (loopNode.config.parallel === true) {
        await Promise.all(iterations.map(runIteration));
      } else {
        for (const iteration of iterations) {
          await runIteration(iteration);
        }
      }
      return iterations.every((iteration) => !iteration.scope.failed);
    };

    const runLoop = async (
      node: WorkflowNode,
      output: StepIo,
      grant: LoopGrant,
      steps: StepOutputs,
      scope: Scope,
    ): Promise<void> => {
      const isRoot = scope.root === undefined;
      const root = scope.root ?? { saved: false };
      const released = new Set(grant.released);
      if (grant.saved > 0 || released.size > 0) {
        root.saved = true;
      }
      const offset = grant.resumes.length;
      const ownEntries = grant.items.map((item, position) => ({
        item,
        index: offset + position,
        tracker: { touched: false },
      }));
      if (isRoot) {
        const carriedUnits = grant.carried.map((unit, unitIndex) => {
          const start = grant.carried
            .slice(0, unitIndex)
            .reduce((sum, earlier) => sum + earlier.items.length, 0);
          return {
            nodeId: node.id,
            context: unit.context,
            items: ownEntries.slice(start, start + unit.items.length).map((entry) => ({
              item: entry.item,
              path: String(entry.index),
              tracker: entry.tracker,
            })),
          };
        });
        claims.push({ rootNodeId: node.id, units: carriedUnits });
      }

      let completed = true;
      for (const [index, resume] of grant.resumes.entries()) {
        const resumed = nodes.get(resume.nodeId)!;
        const entries = resume.items.map((item, position) => ({
          item,
          index: position,
          tracker: { touched: false },
        }));
        claims.at(-1)!.units.push({
          nodeId: resume.nodeId,
          context: resume.context,
          items: entries.map((entry) => ({
            item: entry.item,
            path: `${index}.${entry.index}`,
            tracker: entry.tracker,
          })),
        });
        const pending = entries.filter((entry) => !released.has(`${index}.${entry.index}`));
        const resumeScope = {
          path: [...scope.path, index],
          failed: false,
          items: scope.items,
          rootLoopId: scope.rootLoopId ?? node.id,
          root,
        };
        const ok = await iterate(resumed, pending, resume.context.steps, resumeScope, root, (position) => [
          ...scope.path,
          index,
          position,
        ]);
        completed &&= ok;
        if (ok && resume.complete && pending.length === entries.length) {
          const resumedOutput = {
            items: resume.items,
            processed: resume.items.length,
            total: resume.items.length,
          };
          await follow(edgesFrom(resumed.id, 'done'), resumeScope, () => ({
            from: resumed.id,
            output: resumedOutput,
            steps: { ...resume.context.steps, [resumed.id]: resumedOutput },
          }));
        }
      }

      const pendingOwn = ownEntries.filter((entry) => !released.has(String(entry.index)));
      const ownCompleted = await iterate(node, pendingOwn, steps, scope, root, (index) => [
        ...scope.path,
        index,
      ]);
      if (!completed || !ownCompleted) {
        scope.failed = true;
        return;
      }
      if (isRoot ? !root.saved : grant.saved === 0) {
        await follow(edgesFrom(node.id, 'done'), scope, () => ({ from: node.id, output, steps }));
      }
    };

    await follow(edgesFrom(triggerNodeId), { path: [], failed: false, items: [] }, () => ({
      from: triggerNodeId,
      output: {},
      steps: { [triggerNodeId]: {} },
    }));
    await reconcileStatus();
    if (failed || runCancelled) {
      await releaseUnprocessed();
    }
    if (!runCancelled) {
      await transitionWorkflowRun({
        runId,
        from: status,
        to: failed ? 'failed' : 'succeeded',
      });
    }
  } catch (error) {
    if (isCancellation(error)) {
      await CancellationScope.nonCancellable(releaseUnprocessed);
      throw error;
    }
    await CancellationScope.nonCancellable(async () => {
      await releaseUnprocessed();
      await failWorkflowRun({ runId, error: failureMessage(error as Error) });
    });
  }
}
