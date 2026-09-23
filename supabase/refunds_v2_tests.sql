-- Tests for 2026-09-23_refunds_v2.sql. One DO block; seeds a throwaway tournament, runs market_check,
-- and ends in an EXPECTED exception so nothing it wrote survives. Every line of the report must say PASS.
do $t$
declare
  rep text := '';
  r jsonb;
  tid text := 'zz_refund_test';
  ok boolean;
begin
  -- T1 the two tables.
  ok := public.refund_fraction_for('usopen_2026','R128') = 0.75 and public.refund_fraction_for('usopen_2026','R64') = 0.70
    and public.refund_fraction_for('usopen_2026','R32') = 0.55 and public.refund_fraction_for('usopen_2026','R16') = 0.40
    and public.refund_fraction_for('usopen_2026','QF') = 0.25 and public.refund_fraction_for('usopen_2026','SF') = 0;
  rep := rep || format(E'T1a finished events keep 75·70·55·40·25: %s\n', case when ok then 'PASS' else 'FAIL' end);
  ok := public.refund_fraction_for(tid,'R128') = 0.60 and public.refund_fraction_for(tid,'R64') = 0.55
    and public.refund_fraction_for(tid,'R32') = 0.45 and public.refund_fraction_for(tid,'R16') = 0.30
    and public.refund_fraction_for(tid,'QF') = 0.15 and public.refund_fraction_for(tid,'F') = 0
    and public.refund_fraction_for(tid,null) = 0;
  rep := rep || format(E'T1b every other event 60·55·45·30·15, SF/F/null 0: %s\n', case when ok then 'PASS' else 'FAIL' end);
  ok := round(9 * public.refund_fraction_for(tid,'QF'), 1) = 1.4 and round(9 * public.refund_fraction_for(tid,'R64'), 1) = 5.0;
  rep := rep || format(E'T1c halves round up: $9M at 15%% = 1.4, at 55%% = 5.0: %s\n', case when ok then 'PASS' else 'FAIL' end);

  -- T2 market_check's bank on a seeded event. R64 played; R32 scheduled tomorrow → window R32 (tag R64).
  insert into public.player_stats (tournament_id, id, ranking, price, tier) values
    (tid,'s1',40,9,'Silver'), (tid,'s2',41,7,'Silver'), (tid,'g1',15,20,'Gold'),
    (tid,'w1',42,6,'Silver'), (tid,'n1',43,5,'Silver'), (tid,'n2',44,4,'Silver');
  insert into public.matches (tournament_id, round, slot, p1_id, p2_id, winner_id, started_at) values
    (tid,'R64',0,'s1','o1','o1', now() - interval '1 day'),
    (tid,'R64',1,'s2','o2','s2', now() - interval '1 day'),
    (tid,'R64',2,'g1','o3','g1', now() - interval '1 day'),
    (tid,'R64',3,'n1','o4','n1', now() - interval '1 day'),
    (tid,'R64',4,'n2','o5','n2', now() - interval '1 day'),
    (tid,'R32',0,'o1','s2',null, now() + interval '1 day'),
    (tid,'R32',1,'g1','n1',null, now() + interval '1 day'),
    (tid,'R32',2,'n2','o6',null, now() + interval '1 day');
  -- s1 lost in R64 ($9M) → 55%; w1 never in the draw ($6M) → 100% and a free transfer.
  r := public.market_check(tid,
         jsonb_build_object(
           'initialSquad', jsonb_build_array('s1','s2','g1','w1'),
           'myTeam',       jsonb_build_array('s2','g1','n1','n2'),
           'transfers',    jsonb_build_array(jsonb_build_object('out','s1','in','n1','round','R64'),
                                             jsonb_build_object('out','w1','in','n2','round','R64'))),
         jsonb_build_object('transfers', '[]'::jsonb));
  rep := rep || format(E'T2a market_check accepts the basket: %s (%s)\n',
                       case when (r->>'ok')::boolean then 'PASS' else 'FAIL' end, coalesce(r->>'error', 'ok'));
  rep := rep || format(E'T2b refunds = 5.0 (9 × 55%%) + 6 (withdrawn, 100%%) = 11.0: %s (got %s)\n',
                       case when (r->>'refunds')::numeric = 11.0 then 'PASS' else 'FAIL' end, r->>'refunds');
  rep := rep || format(E'T2c bank = 200 − 42 + 11.0 − 9 = 160.0: %s (got %s)\n',
                       case when (r->>'bank')::numeric = 160.0 then 'PASS' else 'FAIL' end, r->>'bank');
  rep := rep || format(E'T2d the withdrawn replacement is free: used = 1: %s (got %s)\n',
                       case when (r->>'used')::int = 1 then 'PASS' else 'FAIL' end, r->>'used');

  -- T3 the old table would have given 6.3 + 6 = 12.3; make sure it did not.
  rep := rep || format(E'T3 not the old table (12.3): %s\n', case when (r->>'refunds')::numeric <> 12.3 then 'PASS' else 'FAIL' end);

  raise exception E'ROLLBACK (expected) — report:\n%', rep;
end $t$;
