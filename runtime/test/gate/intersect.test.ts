// Tests for intersectGrants — the §8.5 sub-agent inheritance rule. The child
// grant is parent ∩ requested: only shared capabilities, at the stricter tier,
// never a superset. This is what makes spawn-time privilege escalation impossible.

import { describe, it, expect } from 'vitest';
import { intersectGrants } from '../../src/gate/intersect.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { RoleGrant } from '../../src/gate/types.ts';

describe('intersectGrants — shared caps at the stricter tier', () => {
  it('keeps a shared capability at the equal tier', () => {
    expect(intersectGrants({ W: 'T3' }, { W: 'T3' })).toEqual({ W: 'T3' });
  });

  it('takes the STRICTER (more-gated) tier of the two', () => {
    // T2 is stricter than T3 (rank 2 > 1).
    expect(intersectGrants({ W: 'T3' }, { W: 'T2' })).toEqual({ W: 'T2' });
    // T1 is the strictest.
    expect(intersectGrants({ DEP: 'T2' }, { DEP: 'T1' })).toEqual({ DEP: 'T1' });
  });
});

describe('intersectGrants — escalation is impossible (never a superset)', () => {
  it('drops a capability the PARENT lacks', () => {
    const parent: RoleGrant = { MDL: 'T0', R: 'T0' };
    const requested: RoleGrant = { MDL: 'T0', R: 'T0', DEP: 'T1', SH: 'T2' };
    expect(intersectGrants(parent, requested)).toEqual({ MDL: 'T0', R: 'T0' });
  });

  it('drops a capability only the requested role has', () => {
    expect(intersectGrants({ SEC: 'T1' }, { W: 'T3' })).toEqual({});
  });

  it('a code-developer spawning devops does NOT inherit DEP/SEC/SPEND (no escalation)', () => {
    const child = intersectGrants(roleGrant('code-developer')!, roleGrant('devops')!);
    expect(child.DEP).toBeUndefined();
    expect(child.SEC).toBeUndefined();
    expect(child.SPEND).toBeUndefined();
    expect(child.NETw).toBeUndefined();
    // shared caps survive at the stricter tier
    expect(child.W).toBe('T3');
    expect(child.SH).toBe('T2');
  });
});

describe('intersectGrants — the coordinator narrowing (literal §8.5, flagged tension)', () => {
  it('a coordinator spawning code-developer yields a THIN child (no W/SH) — by design for now', () => {
    const child = intersectGrants(roleGrant('build-coordinator')!, roleGrant('code-developer')!);
    expect(child).toEqual({ MDL: 'T0', R: 'T0', PLAN: 'T0', HO: 'T2' });
    expect(child.W).toBeUndefined(); // coordinator lacks W → child can't write (yet)
  });
});
