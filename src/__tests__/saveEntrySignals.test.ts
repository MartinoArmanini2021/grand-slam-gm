import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntryWrite } from '../data/cloud';

// Mock the Supabase client so we can drive the RPC's return and assert how saveEntry maps
// it to the caller (CloudSync). This covers the F2 rev-conflict SIGNAL — CloudSync converges
// on it (re-fetch + adopt cloud) — and the F1 validation-rejection surfacing.
const rpc = vi.fn();
vi.mock('../auth/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { saveEntry } from '../data/cloud';

const entry: EntryWrite = { squad: [], captainHistory: [], phase: 'draft', currentRoundIndex: 0, budget: 150, state: { myTeam: [] } };

describe('saveEntry → RPC result mapping', () => {
  beforeEach(() => rpc.mockReset());

  it('success → { ok, rev } (the new rev to remember)', async () => {
    rpc.mockResolvedValue({ data: 7, error: null });
    expect(await saveEntry('u', 'l', 't', entry, 6)).toEqual({ ok: true, rev: 7 });
    expect(rpc).toHaveBeenCalledWith('save_entry', { p_tournament: 't', p_league: 'l', p_state: entry.state, p_base_rev: 6 });
  });

  it('rev conflict (SQLSTATE 40001) → { ok:false, conflict:true } so CloudSync converges', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'entry changed elsewhere' } });
    expect(await saveEntry('u', 'l', 't', entry, 6)).toMatchObject({ ok: false, conflict: true });
  });

  it('validation rejection → { ok:false, invalid:<reason> } surfaced to the user', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Squad has duplicate players' } });
    const r = await saveEntry('u', 'l', 't', entry, 6);
    expect(r.ok).toBe(false);
    expect(r.invalid).toMatch(/duplicate/);
    expect(r.conflict).toBeUndefined();
  });
});
