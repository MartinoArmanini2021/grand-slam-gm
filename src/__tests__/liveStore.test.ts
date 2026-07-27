import { describe, it, expect, beforeEach } from 'vitest';
import { useLiveStore } from '../store/liveStore';
import { matchKey } from '../data/liveResults';

const k0 = matchKey('SF', 0);
const k1 = matchKey('SF', 1);

describe('liveStore — feed vs admin override', () => {
  beforeEach(() => useLiveStore.getState().resetLive());

  it('recordResult sets a result and marks it an override', () => {
    useLiveStore.getState().recordResult('SF', 0, 'alice');
    const s = useLiveStore.getState();
    expect(s.results[k0]).toBe('alice');
    expect(s.overrides[k0]).toBe(true);
  });

  it('the feed fills in un-touched matches but never overwrites an admin override', () => {
    // admin corrects SF0 to 'alice'
    useLiveStore.getState().recordResult('SF', 0, 'alice');
    // feed then reports SF0 as 'bob' (a bad scrape) and SF1 as 'dana' (new)
    useLiveStore.getState().mergeResults({ [k0]: 'bob', [k1]: 'dana' }, 1234);
    const s = useLiveStore.getState();
    expect(s.results[k0]).toBe('alice'); // override wins — bad scrape rejected
    expect(s.results[k1]).toBe('dana');  // untouched match accepted from feed
    expect(s.lastSync).toBe(1234);
  });

  it('clearing an override lets the feed repopulate that match', () => {
    useLiveStore.getState().recordResult('SF', 0, 'alice');
    useLiveStore.getState().clearResult('SF', 0);
    let s = useLiveStore.getState();
    expect(s.results[k0]).toBeUndefined();
    expect(s.overrides[k0]).toBeUndefined();
    // feed may now set it
    useLiveStore.getState().mergeResults({ [k0]: 'bob' }, 2000);
    s = useLiveStore.getState();
    expect(s.results[k0]).toBe('bob');
  });

  it('a plain feed result is not an override, so a later feed can update it', () => {
    useLiveStore.getState().mergeResults({ [k0]: 'alice' }, 1);
    useLiveStore.getState().mergeResults({ [k0]: 'bob' }, 2); // correction from the source itself
    const s = useLiveStore.getState();
    expect(s.results[k0]).toBe('bob');
    expect(s.overrides[k0]).toBeUndefined();
  });
});
