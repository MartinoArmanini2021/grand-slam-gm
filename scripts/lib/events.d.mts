// Types for events.mjs. The tooling has to be plain .mjs so Node can run it without a build step
// (it can't import the app's TS — players.ts reaches import.meta.env, a Vite-only global). These
// declarations exist so fieldTooling.test.ts, which pins the tooling↔app parity, still typechecks
// under `tsc -b`. Keep them in step with the object literal in events.mjs.

export interface ManualEntrant {
  id: string;
  name: string;
  country: string;
  flag: string;
  age: number;
  hand: 'R' | 'L';
  ranking: number;
}

export interface EventDef {
  page: string;      // Wikipedia men's-singles article — must equal what liveData derives
  field: string;     // repo-relative path of the field JSON this event writes
  seed: string;      // repo-relative path of its player_stats seed SQL
  label: string;
  surface: 'hard' | 'clay' | 'grass';
  manual?: ManualEntrant[];  // real entrants outside the top-300 pool
}

export declare const EVENTS: Record<string, EventDef>;
export declare function getEvent(id: string): EventDef;
export declare function expandManual(m: ManualEntrant): ManualEntrant & {
  seed: null;
  surface: { hard: number; clay: number; grass: number };
  ytd: { wins: number; losses: number; titles: number };
  yearResults: { short: string; result: string }[];
};
