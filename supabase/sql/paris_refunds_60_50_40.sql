-- Paris 2026 refunds (owner, 3 Nov 2026: "Yes, 60/50/40"): a knocked-out player gives back 60% of his
-- price after the Last 16, 50% after the quarter-finals, 40% after the semi-finals. Replaces the full
-- refund of paris_five_free_picks.sql. Simulated: ~1.5 of the 5 transfers used per manager, the winner
-- ~58 points over the middle of the table; the market before the final stays open without handing
-- everyone both finalists (a full refund there gave half the managers both). Applied 3 Nov 2026 as
-- migration paris_refunds_60_50_40. The app twin is REFUND_FREE_PICK in grand-slam-gm's engine.ts.
create or replace function public.refund_fraction_for(p_tournament text, p_round text)
returns numeric language sql immutable parallel safe as $$
  select (case
    when p_tournament in ('montreal_2026', 'cincinnati_2026', 'usopen_2026') then
      case p_round when 'R128' then 0.75 when 'R64' then 0.70 when 'R32' then 0.55
                   when 'R16' then 0.40 when 'QF' then 0.25 else 0 end
    when p_tournament = 'paris_2026' then
      case p_round when 'R16' then 0.60 when 'QF' then 0.50 when 'SF' then 0.40 else 0 end
    else
      case p_round when 'R128' then 0.60 when 'R64' then 0.55 when 'R32' then 0.45
                   when 'R16' then 0.30 when 'QF' then 0.15 else 0 end
  end)::numeric;
$$;
