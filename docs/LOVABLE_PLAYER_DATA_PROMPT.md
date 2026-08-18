# Paste this into Lovable (attach `lovable-cincinnati-field.json` with it)

---

Use the attached `lovable-cincinnati-field.json` as the **single source of player data**.
Replace any placeholder or invented players — every player in the app must come from this file.

## The data

96 real ATP players (the actual Cincinnati Open 2026 field). Each record:

```json
{
  "id": "zverev",
  "name": "Alexander Zverev",
  "country": "Germany",
  "flag": "🇩🇪",
  "ranking": 3,
  "seed": 1,
  "tier": "Platinum",
  "price": 50,
  "age": 29,
  "hand": "R",
  "photoUrl": "https://www.atptour.com/-/media/alias/player-headshot/Z355",
  "surface": { "hard": 76, "clay": 88, "grass": 86 },
  "ytd": { "wins": 33, "losses": 7, "titles": 1 },
  "yearResults": [
    { "tournament": "Australian Open", "surface": "hard", "short": "AO", "result": "SF" }
  ]
}
```

- `seed` is `1`–`32` for seeded players and `null` for the other 64.
- `tier` is already computed (`Platinum` / `Gold` / `Silver`) — do not recompute it.
- `price` is in $M, range **$4–$50**. Budget is **$150M** for **10 players**.
- `surface` values are win percentages.

## Player images — follow this exactly

**Hotlink the `photoUrl` directly.** Put it straight into an `<img src>` in the browser.

**Do NOT download, cache, proxy, or self-host these images.** Fetching those URLs
server-side returns a different, inconsistent image than the browser receives. They must
be loaded client-side from the original URL.

93 of the 96 players have a `photoUrl`. Three are `null` (Monfils, Kokkinakis, Wolf).

Implement this fallback chain on every avatar:

1. The ATP headshot at `photoUrl`
2. On load error (or `photoUrl === null`) → the player's **initials** as a monogram
3. Final fallback → a neutral player icon

Every avatar sits inside a **tier-coloured ring**: a 2px ring in the tier colour plus a
4px white halo outside it.

- Platinum `#7DE2FC`
- Gold `#FBBF3B`
- Silver `#AEB8C4`

Avatar sizes in use: 32 / 40 / 56 / 96 px. Images are square and should be cropped to a
circle, top-aligned so faces are not cut off.

## Where player data appears

- **Market** — a searchable, filterable list of all 96 players: avatar, name, flag,
  ranking, tier badge, price. Filter by tier, sort by price/rank. This is where drafting
  happens. **The Market must NOT contain a tennis-court graphic** — it is a list.
- **Squad court** — the stadium court graphic belongs on **Home** and **Team only**.
  It shows the captain and vice on court and the other 8 on the bench.
- **Player profile** — full detail: headshot, rank, price, age, hand, country, the
  `surface` win percentages, the `ytd` record, and the `yearResults` season strip
  (each result dot coloured by its `surface`, ordered chronologically).
- **Team page** — per-player points-by-round table.

## Squad rules the Market must enforce

- Exactly **10 players**, **$150M** budget.
- Exact tier quota: **2 Platinum · 3 Gold · 5 Silver** — not minimums, exact.
  Lock a tier once it is full (e.g. no third Platinum).
- Show remaining budget and remaining slots per tier at all times.
