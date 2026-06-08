// Tests for the org routing table (CLAUDE.md org chart as data). The table bounds
// WHO each dispatcher may instantiate; it is the structural half of Option A
// delegation — the grant half lives in spawn.ts (child runs at the role's own §4
// ceiling). Cross-layer reach (research-coordinator → devops) must be blocked here.

import { describe, it, expect } from 'vitest';
import { ROUTING, isDispatcher, mayRoute } from '../../src/gate/org.ts';
import { roleGrant } from '../../src/gate/grants.ts';

describe('org routing — the dispatchers hold SPAWN, leaves do not', () => {
  it('every routing key holds SPAWN; every routed child does not (leaves)', () => {
    for (const dispatcher of Object.keys(ROUTING)) {
      expect(roleGrant(dispatcher)!.SPAWN).toBe('T2');
    }
  });

  it('isDispatcher is true exactly for the 6 SPAWN-holders', () => {
    expect(isDispatcher('central-orchestrator')).toBe(true);
    expect(isDispatcher('build-coordinator')).toBe(true);
    expect(isDispatcher('code-developer')).toBe(false);
    expect(isDispatcher('nope')).toBe(false);
    expect(Object.keys(ROUTING)).toHaveLength(6);
  });
});

describe('org routing — the CLAUDE.md graph, edge by edge', () => {
  it('the orchestrator routes to the 5 coordinators + the packager', () => {
    expect(ROUTING['central-orchestrator']).toEqual([
      'research-coordinator',
      'build-coordinator',
      'operate-coordinator',
      'distribution-coordinator',
      'learning-coordinator',
      'distribution-packager',
    ]);
  });

  it('the build coordinator routes to its 5 build specialists', () => {
    expect(ROUTING['build-coordinator']).toEqual([
      'architect',
      'ux-designer',
      'code-developer',
      'qa-testing',
      'truth-agent',
    ]);
  });
});

describe('org routing — mayRoute bounds cross-layer reach', () => {
  it('permits an in-chart edge', () => {
    expect(mayRoute('build-coordinator', 'code-developer')).toBe(true);
    expect(mayRoute('central-orchestrator', 'build-coordinator')).toBe(true);
  });

  it('blocks a cross-layer edge (research-coordinator cannot reach devops)', () => {
    expect(mayRoute('research-coordinator', 'devops')).toBe(false);
  });

  it('blocks a non-dispatcher spawner', () => {
    expect(mayRoute('code-developer', 'qa-testing')).toBe(false);
  });

  it('blocks the orchestrator skipping a coordinator to reach a specialist', () => {
    expect(mayRoute('central-orchestrator', 'code-developer')).toBe(false);
  });
});
