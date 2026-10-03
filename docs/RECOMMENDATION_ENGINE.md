# Recommendation Engine v2

## Goal

Choose the most useful story for the traveller while considering **where the traveller is on the route and how far ahead the story is**. The engine should introduce stories naturally rather than waiting until the traveller is already at the location.

## Architecture

```text
GPS / route position
        |
        v
PostGIS candidate retrieval (wide search corridor)
        |
        v
Eligibility
  |-- verified + active
  |-- family friendly
  |-- not already played
  |-- quality threshold
  |-- not materially behind traveller
  |-- not too far ahead
        |
        v
Scoring
  |-- interestingness
  |-- traveller interest match
  |-- source confidence
  |-- route proximity
  |-- novelty
  |-- category diversity
  |-- ahead-of-traveller timing
        |
        v
Top candidate + alternatives + rejection reasons
```

## V2 spatial behaviour

Search and speech windows are intentionally different:

- Search radius: 5 km by default.
- Preferred story location: 800 m–3 km ahead.
- Maximum story location: 5 km ahead.
- Small grace behind the traveller: 500 m.
- Default narration gap: 8 minutes.

A story can therefore be discovered early and selected before the traveller reaches it.

## Score

- interestingness: 30%
- traveller interest match: 20%
- source confidence: 15%
- proximity: 10%
- novelty: 10%
- category diversity: 10%
- ahead-of-traveller timing: 5%

Weights sum to 100% and are deliberately deterministic for the MVP.

## Explainability

The recommendation response exposes:

- selected story
- ranked alternatives
- score breakdown
- positive reasons
- rejected candidates and rejection reasons

This makes simulator tuning possible without guessing why a story was selected.

## Import behaviour

`npm run import-content` is idempotent for the curated JSON file. IDs are deterministic, content rows use `ON CONFLICT DO UPDATE`, and translations use `ON CONFLICT (content_id, language) DO UPDATE`.

Curated production content is marked `review_status='verified'` and `verified=true` by default. Add `--pending` when importing content that still requires review.


## V2.1 corrections

- The simulator now distinguishes the **decision distance** (how far ahead the story was when the engine selected it) from the **trigger distance** (how far ahead the story is when narration begins).
- This avoids confusing output such as a story being selected 4 km ahead but narrated 800 m before the POI. Both values are now explicit.
- Content imports use a stable `content_key`, so repeated imports update existing rows instead of creating duplicate stories.
- Migration `003_content_key_and_dedupe.sql` removes duplicate imported rows while keeping the best copy and adds a unique index for future imports.
