# Behavioural evidence — Cincinnati 2026, read from production 2026-08-18

Gathered for the Phase 3 UX work, by querying `public.entries` and `public.player_stats` directly
(read-only). **PostHog could not be queried**: the repo holds only the write-only project key
(`phc_…`); the query API needs a personal key (`phx_…`), which is not available here. So this is
outcome data rather than clickstream — what people ended up with, not every tap. For the question
being asked ("why don't they understand it?") outcomes are arguably the stronger evidence: they show
where people stopped, not merely where they hesitated.

## The headline: half of everyone scored nothing

| | |
|---|---|
| Entries | **8** |
| Locked a squad (and therefore score) | **4** |
| Never locked (score exactly 0) | **4** |
| Set a captain | **8 — everyone** |

Every single manager picked a captain. Every one of them engaged. **Half still scored zero.**

## The four who scored nothing

| Manager | Picked | Tiers (P/G/S) | Budget left | Still needs | Cheapest way to finish | Verdict |
|---|---|---|---|---|---|---|
| `88f692fa` | **10** | **2/3/5 — legal** | **$0.0** | nothing | — | **Finished the puzzle. Never pressed the button.** |
| `32828145` | 7 | 1/3/3 | $7.0 | 1P 2S | **$26M** | **Mathematically stuck — $19M short** |
| `524e264f` | 6 | 2/3/1 | $31.0 | 4S | $16M | Could finish, with $15M spare. Stopped anyway. |
| `51face7f` | 2 | 2/0/0 | $69.0 | 3G 5S | **$65M** | Could finish — by $4M. One tap from a dead end. |

### 1. `88f692fa` built a perfect squad and scored zero

Ten players. Exactly 2 Platinum, 3 Gold, 5 Silver. Every dollar of the $150M spent. A captain
chosen. **23 saves** — they came back again and again.

And zero points, because they never pressed **Lock Squad**.

This one entry is the entire Phase 3 brief in a single row. The product asked them to do something
hard, they did it perfectly, and then a button whose label sounds irreversible stopped them at the
finish line. The founder's instinct in 3.4 — that "Lock" is scarier and less accurate than what
actually happens — is not a hunch. It has a name and a rev count.

### 2. `32828145` is in a dead end the app never warned about

Seven players, $7M left, and they need one Platinum and two Silvers. The cheapest possible
combination costs $26M. **They cannot finish.** Their only route out is to remove players they have
already chosen — and nothing on screen says so. From the manager's side this reads as a game that
simply stopped working.

The draft let them spend into an impossible position with no warning at any point.

### 3. `51face7f` is $4M from the same trap

Two Platinum players, $69M left, and a minimum of $65M needed to complete a legal squad. They have
94% of their remaining budget already committed to a floor they cannot see. One ordinary-looking
pick — a $10M Gold rather than the $17M minimum — and they join `32828145` in the dead end.

They saved 10 times across two players. That is someone trying to work out the rules by poking at
them.

## What this says about the current design

1. **The finish line is invisible.** Nothing tracks "you need 3 more Silvers and at least $12M to
   finish legally". The constraint is enforced but never *projected forward*, so managers discover
   it only by hitting it.
2. **Dead ends are reachable and unmarked.** The rules permit a squad that cannot be completed. That
   is a design failure, not a user error — an affordability floor is computable at every step.
3. **The lock button loses a completed squad.** The one manager who solved the whole puzzle scored
   nothing. Whatever else changes, this must not survive.
4. **Repeated saving is a symptom.** rev counts of 23, 10 and 7 on *unfinished* squads say people
   are re-reading the same screen for information it does not give them.

## What is NOT evidence here

- No clickstream, so this cannot say which screen they abandoned from, how long anything took, or
  whether they ever opened the rules. If a PostHog personal API key becomes available, the funnel
  worth building is: tab_view(draft) → first pick → 10th pick → squad_locked.
- Eight entries is a small sample and they are all friends of the founder. These are strong signals,
  not statistics.
- The event taxonomy itself has a gap worth noting: the app tracks `squad_locked` but nothing for
  *starting* a draft or *adding a player*, so even with PostHog access the drop-off inside the draft
  could not be measured today.
