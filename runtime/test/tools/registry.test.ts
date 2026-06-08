// Tests for toolsForRole — the per-role tool surface. A tool is offered to a role
// IFF the role's §4 grant holds that tool's capability. This makes the surface a
// pure function of the matrix: coordinators (no W/SH) physically cannot be handed
// write_file/shell, and only SPAWN-holders get spawn. Governance intent is enforced
// by construction, not by remembering to omit a tool.

import { describe, it, expect } from 'vitest';
import { toolsForRole, ALL_TOOLS } from '../../src/tools/registry.ts';

function names(role: string): string[] {
  return toolsForRole(role).map((t) => t.name).sort();
}

describe('toolsForRole — surface derived from the grant', () => {
  it('code-developer gets write_file, shell, set_plan — but NOT spawn', () => {
    expect(names('code-developer')).toEqual(['set_plan', 'shell', 'write_file']);
  });

  it('a dispatcher (build-coordinator) gets spawn + set_plan — but NOT write_file/shell', () => {
    expect(names('build-coordinator')).toEqual(['set_plan', 'spawn']);
  });

  it('the orchestrator surface matches a coordinator (route + plan only)', () => {
    expect(names('central-orchestrator')).toEqual(['set_plan', 'spawn']);
  });

  it('qa-testing runs tests (shell + plan) but cannot write source', () => {
    expect(names('qa-testing')).toEqual(['set_plan', 'shell']);
  });

  it('every role gets set_plan (PLAN is universal in §4)', () => {
    for (const role of ['architect', 'devops', 'analytics', 'community-manager']) {
      expect(names(role)).toContain('set_plan');
    }
  });
});

describe('toolsForRole — fail-closed on an unknown role', () => {
  it('throws rather than handing a permissive (or empty) surface', () => {
    expect(() => toolsForRole('nope')).toThrow(/unknown role/);
  });
});

describe('ALL_TOOLS — the registry is the single source of known tools', () => {
  it('every registered tool declares a capability the registry can filter on', () => {
    for (const t of ALL_TOOLS) {
      expect(typeof t.capability).toBe('string');
    }
  });
});
