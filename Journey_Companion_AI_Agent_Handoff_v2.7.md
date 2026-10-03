**# Journey Companion — AI Agent Handoff & Product/Engineering Specification**

**Document version:** 2.7  

**Date:** 2026-09-27  

**\*\*Purpose:\*\*** Single source of truth for an AI coding agent taking over development.

\---

**## 1. Executive Summary**

Journey Companion is a road-trip companion that proactively looks around the traveller’s current location and tells them about interesting things nearby or relevant to the immediate journey context:

\- history and culture

\- local food and eateries

\- temples, museums and monuments

\- crafts and local industries

\- unusual/interesting facts about towns, villages and roads

\- family-friendly discoveries

Core product idea:

\> **\*\*Navigation tells you where to go. Journey Companion tells you what you're passing through.\*\***

Example journey: **\*\*Delhi → Nainital\*\***.

### Current MVP decision (2026-09-27)

The current MVP deliberately **does not rank content or require numeric `interestingness` / `editorialScore` values**. The first phase is focused on location-first discovery, eligibility, proximity and pacing. Ranking and personalization are deferred until real playback data exists. Historical sections of this document may mention the previous scoring system; those references describe the existing code/history and are not current MVP requirements unless explicitly marked as current.

The app should feel like a knowledgeable companion, not a notification system or an audiobook.

\---

**## 2. Product Principles**

**### Proactive, not search-driven**

Users should not need to search for "things to see near me". The system discovers relevant content automatically.

**### Ahead of the traveller**

The preferred narration trigger is currently approximately **\*\*800 m–3 km ahead\*\***, with a maximum useful ahead range around **\*\*5 km\*\***.

**### Quality over quantity**

Never lower quality thresholds simply to increase the number of stories. It is better to remain silent than provide an unreliable or boring fact.

**### Natural pacing**

Current target: **\*\*minimum narration gap \~8 minutes\*\***. This is tunable.

**### Interestingness**

Prefer "I didn't know that" stories over generic descriptions.

**### Family-friendly**

Content should work for families and sometimes be understandable to children.

**### Offline-first direction**

Internet availability on Indian highways/rural roads is a known constraint. The final product must support downloading a journey package before departure.

\---

**# 3. Current MVP Journey**

The development/validation journey is:

**\*\*Delhi → Nainital\*\***

Simulator route length is approximately:

**\*\*352.5 km\*\***

\> **\*\*Update (2026-09-04):\*\*** This figure was from an early, coarse straight-line

\> route geometry. The journey's \`route\_geometry\` has since been replaced with

\> a real OSRM road-following route; actual length is now **\*\*274 km\*\***. See

\> §40.1 for the full verified-status addendum.

The journey simulator is currently the primary tool for validating recommendation behaviour before a real mobile app is built.

\---

**# 4. What Already Exists**

**## Backend**

A TypeScript/Node.js backend exists with PostgreSQL/PostGIS-style geographic data.

Validated endpoint:

\`POST /v1/content\`

The content API supports:

\- category

\- tags

\- longitude/latitude

\- interestingness

\- confidence

\- source name

\- source URL

\- English translation

\- Hindi translation

\- narration hint

**## Database**

Existing tables include:

\- \`content\`

\- \`content\_translations\`

Content has geographic information and recommendation metadata.

Translations are stored separately.

**## Content**

A curated dataset of **\*\*32 production-quality records\*\*** exists for Delhi → Nainital.

The importer reports:

\`\`\`text

Importing 32 records

Mode: VERIFIED CURATED CONTENT

Identity: content\_key (idempotent)

\`\`\`

**## Importer**

Existing script:

\`\`\`text

backend/scripts/import-content.ts

\`\`\`

Command:

\`\`\`bash

npm run import-content

\`\`\`

The intended importer behaviour is idempotent:

\`\`\`text

content\_key exists?

       |

   +---+---+

   \|       |

  YES      NO

   \|       |

 UPDATE   INSERT

\`\`\`

Translations should also be upserted.

\---

**# 5. Problems Already Encountered**

**## 5.1 TypeScript rootDir error**

Original error:

\`\`\`text

TS5011:

The common source directory of 'tsconfig.json' is './src'.

The 'rootDir' setting must be explicitly set...

\`\`\`

Required configuration:

\`\`\`json

{

  "compilerOptions": {

    "rootDir": "src",

    "outDir": "dist"

  }

}

\`\`\`

**## 5.2 Missing pg types**

Original:

\`\`\`text

TS7016:

Could not find a declaration file for module 'pg'

\`\`\`

Required development dependencies include:

\`\`\`text

typescript

tsx

@types/node

@types/pg

\`\`\`

Use local dependencies:

\`\`\`bash

npm install

npx tsc --version

\`\`\`

Do not rely on globally installed TypeScript.

**## 5.3 INSERT mismatch**

Original:

\`\`\`text

INSERT has more expressions than target columns

\`\`\`

The importer must always use explicit INSERT columns with matching values.

Never use an ambiguous:

\`\`\`sql

INSERT INTO content VALUES (...)

\`\`\`

Use explicit columns.

**## 5.4 ON CONFLICT error**

Original:

\`\`\`text

ON CONFLICT DO UPDATE requires inference specification or constraint name

\`\`\`

This happened because the database did not have the required unique identity for \`content\_key\`.

A migration was subsequently executed successfully.

Observed output:

\`\`\`text

BEGIN

NOTICE: column "content\_key" of relation "content" already exists, skipping

ALTER TABLE

UPDATE 32

DELETE 0

DROP INDEX

CREATE INDEX

COMMIT

\`\`\`

Interpretation:

\- transaction succeeded

\- \`content\_key\` already existed

\- 32 records were updated

\- zero records were deleted by that migration

\- index creation succeeded

**\*\*Important:\*\*** verify whether the created index is UNIQUE.

Run:

\`\`\`sql

SELECT indexname, indexdef

FROM pg\_indexes

WHERE tablename = 'content'

  AND indexname LIKE '%content\_key%';

\`\`\`

Also:

\`\`\`sql

SELECT conname, contype

FROM pg\_constraint

WHERE conrelid = 'content'::regclass;

\`\`\`

Desired protection is a unique database-level identity for \`content\_key\`.

\---

**# 6. Duplicate Content Issue**

Simulator output showed duplicate stories, including examples such as:

\- "Hapur has a surprisingly varied industrial base"

\- "Moradabad was named after a Mughal prince"

\- "Some Raza Library manuscripts are extraordinarily rare"

appearing more than once.

The system must handle this at **\*\*two levels\*\***:

1\. database identity/deduplication

2\. recommendation candidate deduplication

Do not rely only on the database constraint.

A stable identity can be based on:

\`\`\`text

normalized English title

\+

source

\+

longitude

\+

latitude

\`\`\`

or, preferably for curated content, an explicit stable key such as:

\`\`\`text

pilkhuwa-textile-heritage

hapur-grain-jaggery

moradabad-brass-city

rampur-raza-library

\`\`\`

The identity scheme used by importer and database must be the same.

\---

**# 7. Journey Simulator**

The simulator is working.

Conceptual flow:

\`\`\`text

Route

  ↓

Traveller position

  ↓

Find nearby/upcoming content

  ↓

Hard filters

  ↓

Deduplicate

  ↓

Score

  ↓

Select best candidate

  ↓

Cooldown/history

  ↓

Narrate or remain silent

\`\`\`

It simulates continuous movement along the route.

\---

**# 8. What Simulator Has Proven**

The recommendation engine successfully triggers content **\*\*ahead of the traveller\*\***.

This is the key technical milestone.

Observed approximate examples:

**### Pilkhuwa**

Traveller route fraction:

\`\`\`text

\~0.1313

\`\`\`

Content route fraction:

\`\`\`text

\~0.133538

\`\`\`

On a \~352.5 km route this is approximately:

\`\`\`text

\~790 m ahead

\`\`\`

**### Hapur**

Traveller:

\`\`\`text

\~0.1679

\`\`\`

Content:

\`\`\`text

\~0.170185

\`\`\`

Approximately:

\`\`\`text

\~800 m ahead

\`\`\`

**### Moradabad**

Traveller:

\`\`\`text

\~0.5108

\`\`\`

Content:

\`\`\`text

\~0.513117

\`\`\`

Approximately:

\`\`\`text

\~800 m ahead

\`\`\`

**### Raza Library**

Traveller:

\`\`\`text

\~0.5788

\`\`\`

Content:

\`\`\`text

\~0.581031

\`\`\`

Approximately:

\`\`\`text

\~800 m ahead

\`\`\`

**\*\*Conclusion:\*\*** trigger timing is already approximately right.

Do not rewrite the entire trigger mechanism just because the diagnostic distance field is wrong.

\---

**# 9. Known Spatial Bug**

The simulator's \`aheadDistanceM\` diagnostic has been wrong.

Examples:

\`\`\`text

Actual \~800 m

Reported \~4036 m

\`\`\`

\`\`\`text

Actual \~800 m

Reported \~4695 m

\`\`\`

\`\`\`text

Actual \~800 m

Reported \~4742 m

\`\`\`

The correct route-relative calculation should be:

\`\`\`ts

const aheadDistanceM =

  Math.max(

    0,

    (candidateRouteFraction - travellerRouteFraction)

      \* routeLengthM

  );

\`\`\`

The system should distinguish between:

\`\`\`text

decisionAheadDistanceM

\`\`\`

and:

\`\`\`text

triggerAheadDistanceM

\`\`\`

if candidate selection happens earlier than narration.

\---

**# 10. Recommendation Engine V2**

Current conceptual score:

\`\`\`text

Interestingness       30%

Interest/category fit 20%

Source confidence     15%

Proximity             10%

Novelty                10%

Category diversity     10%

Ahead timing            5%

────────────────────────

                     100%

\`\`\`

These weights currently produce reasonable rankings.

Example:

\`\`\`text

Hapur grain/jaggery       \~0.715

Hapur industrial base     \~0.708

\`\`\`

Moradabad:

\`\`\`text

Brass City                 \~0.733

Named after Mughal prince  \~0.700

\`\`\`

Raza Library:

\`\`\`text

17,000 manuscripts         \~0.747

Rare manuscripts            \~0.744

\`\`\`

**\*\*Do not change scoring weights without simulator evidence.\*\***

\---

**# 11. Current Spatial Configuration**

Current intended configuration:

\`\`\`text

Search radius:           5 km

Preferred ahead range:   0.8–3 km

Maximum ahead:            5 km

Behind tolerance:         \~250 m

Minimum narration gap:    \~8 minutes

\`\`\`

The current sweet spot appears to be around:

\`\`\`text

800 m–2 km ahead

\`\`\`

At highway speeds this gives enough time to introduce a story naturally.

\---

**# 12. Proposed Ahead Timing Score**

Potential future timing function:

\`\`\`text

Distance ahead       Timing score

0–300 m                 0.65

300–800 m               0.90

800–2,000 m             1.00

2,000–3,000 m           0.85

3,000–5,000 m           0.55

\>5,000 m                reject

\`\`\`

This is a tuning proposal, not a hard requirement.

First fix diagnostics and test actual behaviour.

\---

**# 13. Current Major Product Problem: Content Coverage**

The simulated journey is approximately:

\`\`\`text

352.5 km

\`\`\`

but currently produces only about:

\`\`\`text

6 stories

\`\`\`

Observed:

\`\`\`text

average gap: \~50 km

largest gap: \~148 km

\`\`\`

\> **\*\*Update (2026-09-04):\*\*** Resolved. With 99 curated stories and the real

\> (non-approximated) route geometry, the actual simulator output is now

\> \`storyCount: 16\`, \`longestGapKm: 31.3\`, \`avgGapKm: 16.1\`,

\> \`uncoveredStretches: []\`. The root cause of the original gap was not

\> content sparsity alone — it was a coarse route polyline that missed towns

\> (e.g. Moradabad) sitting on the real highway. See §40.1.

This is not primarily a recommendation algorithm problem.

It is a **\*\*content coverage problem\*\***.

Do not solve it by lowering quality thresholds.

\---

**# 14. Content Expansion Target**

Next major milestone:

**\*\*60–100 genuinely useful stories\*\***

for:

\`\`\`text

Delhi

 ↓

Ghaziabad

 ↓

Hapur

 ↓

Gajraula

 ↓

Moradabad

 ↓

Rampur

 ↓

Rudrapur

 ↓

Haldwani

 ↓

Nainital

\`\`\`

Content should be geographically distributed but should not be fabricated just to fill distance.

\---

**# 15. Content Categories**

Target mix:

**### History**

\- old towns

\- trade routes

\- Mughal/colonial history

\- important events

\- old settlements

**### Culture**

\- local traditions

\- festivals

\- customs

\- regional culture

**### Food**

\- famous local foods

\- regional specialties

\- notable eateries

\- food history

Distinguish eventually between:

\`\`\`text

specific eatery recommendation

\`\`\`

and:

\`\`\`text

regional food fact

\`\`\`

Specific businesses require stronger source confidence.

**### Places**

\- museums

\- temples

\- forts

\- monuments

\- libraries

\- hidden attractions

**### Crafts**

\- brassware

\- handloom

\- woodwork

\- artisan traditions

\- local manufacturing

**### Local economy**

\- agricultural products

\- industrial clusters

\- traditional industries

**### Nature**

\- rivers

\- forests

\- geography

\- wildlife

\- landscapes

**### Interesting/weird facts**

This is a key product category because it creates the "I didn't know that" reaction.

**### Family/kids**

Some stories should be understandable and fun for children.

\---

**# 16. Production Content Requirements**

Every production content item should ideally contain:

\`\`\`text

content\_key

title

category

tags

location

interestingness

confidence

sourceName

sourceUrl

shortDescription

longDescription

narrationHint

translations

\`\`\`

Quality requirements:

\- credible source

\- source URL

\- geographic relevance

\- concise factual claim

\- no unsupported superlatives

\- no fabricated history

\- no exaggerated marketing language

Be especially careful with:

\`\`\`text

oldest

largest

only

first

world's biggest

India's oldest

\`\`\`

unless supported by a credible source.

\---

**# 17. Narration**

Stored content and spoken narration are different concepts.

The database should contain:

\`\`\`text

longDescription

narrationHint

\`\`\`

A future narration layer will turn structured content into natural speech.

Example:

Database fact:

\> Moradabad is famous for brassware.

Potential narration:

\> "You're approaching Moradabad, a city famous for brass craftsmanship. If you've ever seen decorative Indian brassware, there's a good chance this region has a connection to it."

The AI must not invent additional facts.

\---

**# 18. Language Strategy**

MVP languages:

\`\`\`text

English

Hindi

\`\`\`

Later:

\`\`\`text

Hinglish

Regional Indian languages

\`\`\`

Do not build a complex translation architecture before validating the core product.

\---

**# 19. Future Recommendation Architecture**

Eventually the engine should be organized as:

\`\`\`text

Journey

  ↓

Traveller context

  ↓

Candidate retrieval

  ↓

Hard filters

  ↓

Deduplication

  ↓

Ranking

  ↓

Diversity

  ↓

Cooldown/history

  ↓

Trigger decision

  ↓

Narration

\`\`\`

\---

**# 20. Candidate Retrieval**

Consider:

1\. geographic distance

2\. route-relative position

3\. whether candidate is ahead

4\. route corridor

5\. destination relevance

Avoid relying only on circular radius.

Long term, the preferred model is:

\`\`\`text

route corridor + route position

\`\`\`

rather than:

\`\`\`text

simple radius

\`\`\`

A location 3 km sideways from the road may be less relevant than one 1 km ahead on the route.

\---

**# 21. Hard Filters**

Reject candidates before scoring when they are:

\- inactive

\- unverified

\- too far behind

\- beyond maximum ahead distance

\- already narrated

\- duplicates

\- missing required translation

\- below minimum confidence

Do not expect scoring to compensate for invalid candidates.

\---

**# 22. Diversity**

Avoid sequences like:

\`\`\`text

History

History

History

History

\`\`\`

Prefer variety:

\`\`\`text

History

Food

Craft

Interesting fact

Nature

History

Place

\`\`\`

Diversity is a ranking adjustment, not an absolute requirement.

An exceptional history story should still be chosen if no other good candidate exists.

\---

**# 23. Novelty**

Do not repeat:

\- exact same story

\- near-identical facts

\- multiple versions of the same fact

Maintain journey history such as:

\`\`\`text

narratedContentIds

recentCategories

recentLocations

\`\`\`

\---

**# 24. Personalization — Future**

Users may eventually select interests:

\`\`\`text

Food

History

Temples

Nature

Shopping

Architecture

Kids

Weird facts

\`\`\`

These become ranking signals.

The MVP must work even without preferences.

Start with deterministic weighting; do not jump immediately to ML.

\---

**# 25. User Feedback — Future**

Potential feedback:

\`\`\`text

👍 Interesting

👎 Not interesting

❤️ Save

\`\`\`

Use it to learn:

\- category preference

\- story type

\- preferred length

\- preferred frequency

Keep the first implementation simple.

\---

**# 26. AI/LLM Usage — Future**

The deterministic recommendation engine should remain responsible for:

\- location

\- route position

\- distance

\- eligibility

\- cooldown

\- deduplication

\- basic ranking

AI/LLM can later handle:

\- narration

\- summarization

\- translation

\- tone adaptation

\- personalization

\- alternative phrasings

\- conversational follow-up

Do not make the LLM the core location/routing decision-maker.

\---

**# 27. AI Narration Architecture**

Future:

\`\`\`text

Structured content

       ↓

Narration prompt

       ↓

LLM

       ↓

Validation

       ↓

TTS

       ↓

Audio playback

\`\`\`

Guard against:

\- hallucinations

\- unsupported claims

\- excessive length

\- repetitive language

\---

**# 28. Offline Architecture**

Known constraint:

**\*\*Internet connectivity can be unreliable during road trips.\*\***

Before departure:

\`\`\`text

User enters journey

       ↓

Backend creates journey package

       ↓

Route

Content

Translations

Narration metadata

Optional audio

       ↓

Download to phone

\`\`\`

During journey:

\`\`\`text

GPS

 ↓

local route matching

 ↓

local recommendation engine

 ↓

local content

 ↓

audio

\`\`\`

Internet should eventually be optional for the core journey experience.

\---

**# 29. Offline Journey Package**

Potential structure:

\`\`\`json

{

  "journeyId": "...",

  "route": {},

  "contentVersion": "...",

  "language": "hi",

  "content": [],

  "audio": [],

  "expiresAt": "..."

}

\`\`\`

A mobile client should eventually be able to execute the basic journey without network access.

\---

**# 30. Mobile App**

Do not build a large mobile application yet.

First prove:

1\. recommendation logic

2\. content quality

3\. route coverage

4\. narration timing

5\. offline design

Then build a simple travel UI.

Basic flow:

\`\`\`text

Start Journey

 ↓

Choose language

 ↓

Download journey

 ↓

Drive

 ↓

Story trigger

 ↓

Play narration

 ↓

Optional feedback

\`\`\`

The UI should be simple because the traveller should not interact with the screen while driving.

\---

**# 31. Monetization Hypotheses**

Potential future models:

**## Free**

\- basic stories

\- limited journeys

**## Premium**

\- unlimited journeys

\- richer stories

\- AI narration

\- multiple languages

\- offline journey packs

\- family mode

\- curated discovery

Possible pricing to test:

\`\`\`text

₹49–₹99 per journey

\`\`\`

or:

\`\`\`text

₹149–₹299/month

\`\`\`

These are hypotheses, not validated prices.

**## Sponsored local discovery**

Businesses could eventually pay for discovery.

Sponsored content must be clearly labelled and must not corrupt editorial recommendation quality.

**## Tourism partnerships**

Potential partners:

\- tourism boards

\- hotels

\- local attractions

\- highway services

\- destination businesses

\---

**# 32. Product Validation Questions**

Before spending heavily on mobile development, validate:

1\. Do people enjoy unsolicited stories while driving?

2\. Is the timing comfortable?

3\. Do users want food/place recommendations?

4\. Do families find it useful?

5\. Do people care about facts about the road/city/village?

6\. Would users pay?

7\. How much narration is too much?

8\. Do users prefer Hindi, English or Hinglish?

9\. Is offline mode essential?

10\. Which categories get the best engagement?

The simulator validates technical behaviour.

Real users validate product-market fit.

\---

**# 33. Current Direction & Immediate Roadmap — Journey Experience Validation**

> **Status as of 2026-09-04:** The project has moved from backend/recommendation correctness into **journey-experience validation**.
>
> The technical foundation is now sufficiently mature for MVP experimentation: backend, PostgreSQL/PostGIS, deterministic recommendation engine, real road-following route, content importer, duplicate protection, ahead triggering, simulator, automated tests, and a partially built offline package are working.
>
> **Do not immediately add infrastructure, build the full mobile app, or generate another large batch of stories.**
>
> The next product question is: **"Does the sequence of stories actually make a road journey more interesting, useful and enjoyable?"**

**## Phase 1 — Journey Playback Report**

Build a human-readable **Journey Playback Report** from the existing simulator output. Prefer a CLI/reporting tool first.

For every triggered story, report:
```text
timeFromStart
approxKm
title
category
score
scoreBreakdown
decisionAheadDistanceM
triggerAheadDistanceM
estimated narration duration
gap since previous story
```

Overall metrics:
```text
route distance
assumed speed
estimated journey duration
stories triggered
stories per hour
average gap
minimum gap
maximum gap
longest silent stretch
average/min/max trigger distance
category distribution
top rejected candidates
rejection reasons
never-triggered candidates
```

The report must answer: **"If I drive Delhi → Nainital, what exactly does Journey Companion tell me, in what order, and how often?"**

**## Phase 2 — Editorial Review of Existing Content**

There are **99 active curated stories**, but story count alone is not a product-quality metric. The current real-route simulator result is:
```text
route: 274 km
storyCount: 16
longestGapKm: 31.3
avgGapKm: 16.1
uncoveredStretches: []
```

Do not assume 16 stories is too many or too few until playback shows actual timing, quality and narration duration. Review triggered stories for factual quality, "I didn't know that" value, geographic relevance, usefulness while driving, family friendliness, redundancy, category diversity and narration potential.

**## Phase 3 — Story Quality Metadata**

If justified by the review, add lightweight metadata such as:
```text
storyType
editorialScore
estimatedNarrationSeconds
familyFriendly
visualInterest
conversationPotential
requiresStop
evergreen
```
Only add fields that improve selection, narration or evaluation.

**## Phase 4 — AI Narration + TTS Prototype**

Take approximately **10 representative stories** and create English and Hindi natural spoken versions with TTS. Evaluate length, naturalness, factual fidelity, driving comprehension, companion-like tone and timing. The LLM must remain constrained by verified source content and must not invent facts.

**## Phase 5 — Narration Frequency Experiment**

Compare multiple pacing settings, for example:
```text
~8 minutes
~12–15 minutes
~20 minutes
```
Compare story count, silent stretches, interruption frequency, story quality and spoken minutes per journey hour. Optimize for comfortable narration density, not maximum triggers.

**## Phase 6 — Real-World Driving Prototype**

After playback and narration experiments, build only a minimal driving prototype:
```text
Start Journey → Choose language → Load journey → Drive → GPS/route position → Story trigger → Play narration
```
Run Delhi → Nainital personally and then with approximately **5–10 real users**. Validate enjoyment, timing, category engagement, narration length/frequency, language preference, family usefulness, offline importance and willingness to pay.

**## Phase 7 — Targeted Content Expansion**

Only after playback and real-user tests identify genuine gaps should additional content be created. The **60–100 story target remains an aspiration, not a trigger-count requirement**. Do not create stories simply to eliminate silence.

Use:
```text
Identify weak geographic segment → identify missing useful story type → research credible source → create story → import → simulate → review playback
```

Avoid blindly importing prepared expansion files if they duplicate the existing 99 stories.

**## Phase 8 — Later Product Development**

After the core journey experience is validated:
1. personalization
2. richer offline packages including audio
3. production mobile app
4. feedback loop
5. monetization experiments
6. tourism/business partnerships

**## Current Priority Order**
```text
Journey experience
↓
Story quality
↓
Narration quality
↓
Real-user validation
↓
Targeted content gaps
↓
Offline/mobile polish
↓
Personalization
↓
Monetization
```
Do not optimize for more infrastructure, more stories, more AI or more features.

**# 34. Engineering Rules for the AI Agent**

**## Rule 1 — Inspect before modifying**

Before changing code:

\`\`\`text

inspect repository tree

inspect package.json

inspect tsconfig

inspect schema

inspect migrations

inspect importer

inspect recommendation engine

inspect simulator

inspect tests

\`\`\`

Do not assume this document exactly matches the current repository.

**## Rule 2 — Do not rewrite working behaviour unnecessarily**

The \~800 m ahead trigger behaviour has already been observed.

Fix diagnostics before redesigning trigger logic.

**## Rule 3 — Preserve API compatibility**

Do not break:

\`\`\`text

POST /v1/content

\`\`\`

without a migration plan.

**## Rule 4 — Every schema change gets a migration**

Use:

\`\`\`text

db/migrations/XXX\_description.sql

\`\`\`

Never silently change production schema during application startup.

**## Rule 5 — Import must be idempotent**

Running:

\`\`\`bash

npm run import-content

\`\`\`

repeatedly must not create duplicates.

**## Rule 6 — Test algorithm changes**

Every recommendation change should include simulator/test evidence.

**## Rule 7 — Never solve sparse content with bad ranking**

If there are only six excellent stories, create more excellent stories.

Do not lower thresholds simply to fill silence.

**## Rule 8 — Avoid premature AI**

Deterministic recommendation must work before LLM integration.

**## Rule 9 — Make recommendations explainable**

Expose score components:

\`\`\`text

interestingness

confidence

proximity

ahead timing

novelty

diversity

personalization

\`\`\`

when available.

**## Rule 10 — Never invent factual travel content**

Production facts require credible sources.

\---

**# 35. Recommended Recommendation Result**

Eventually:

\`\`\`json

{

  "contentId": "abc123",

  "contentKey": "moradabad-brass-city",

  "score": 0.7331,

  "decisionAheadDistanceM": 4200,

  "triggerAheadDistanceM": 900,

  "scoreBreakdown": {

    "interestingness": 0.9,

    "confidence": 0.95,

    "proximity": 0.8,

    "aheadTiming": 1.0,

    "novelty": 0.8,

    "diversity": 0.7

  }

}

\`\`\`

This is primarily for debugging and observability.

\---

**# 36. V2.2 Acceptance Criteria**

V2.2 is complete only when:

**### Database**

\- no duplicate \`content\_key\`

\- unique identity verified

\- curated content remains intact

**### Import**

Running importer twice produces the same record count.

**### Build**

\`\`\`bash

npm run build

\`\`\`

passes.

**### Tests**

\`\`\`bash

npm test

\`\`\`

passes.

**### Simulator**

\- ahead distance is mathematically correct

\- duplicate candidates are removed

\- \~800 m trigger behaviour remains intact

\- candidates beyond maximum ahead distance are rejected

\- recently narrated content is not immediately repeated

\---

**# 37. Content Expansion Acceptance Criteria**

For Delhi → Nainital:

\- at least 60 quality items

\- preferably 60–100

\- no obvious duplicates

\- every factual item has a source

\- coordinates verified

\- English + Hindi for core content

\- category diversity

\- substantially reduced silent stretches

\---

**# 38. What NOT to Build Yet**

Do not prematurely introduce:

\`\`\`text

complex ML

vector database

embeddings everywhere

microservice architecture

Kubernetes deployment

event streaming

complex user profile system

large recommendation infrastructure

\`\`\`

The MVP needs a simple deterministic engine and excellent content.

\---

**# 39. Long-Term Product Vision**

The eventual product should feel like:

\> **\*\*"Google Maps tells me where to go. Journey Companion tells me what I'm passing through."\*\***

Long-term loop:

\`\`\`text

Route

 ↓

Places + history + food + culture + facts

 ↓

Recommendation engine

 ↓

Perfect timing

 ↓

AI narration

 ↓

User feedback

 ↓

Personalization

 ↓

Better recommendations

\`\`\`

Offline:

\`\`\`text

Internet available

 ↓

sync/update

 ↓

offline journey package

 ↓

Internet unavailable

 ↓

journey still works

\`\`\`

\---

**# 40. Current Status**

\> **\*\*Update (2026-09-04):\*\*** The table below reflects the original handoff snapshot.

\> Every row has since been re-verified against the live repository/DB/tests —

\> see the addendum immediately after the table for current, evidence-checked

\> status. Kept as-is here for historical record; do not treat it as current.

\| Component | Status |

\|---|---|

\| Product concept | 🟢 Defined |

\| Backend API | 🟢 Working |

\| PostgreSQL/PostGIS | 🟢 Working |

\| \`content\` table | 🟢 Working |

\| \`content\_translations\` | 🟢 Working |

\| Content API | 🟢 Working |

\| Content importer | 🟡 Needs final verification |

\| 32 curated stories | 🟢 Created |

\| Journey simulator | 🟢 Working |

\| Route simulation | 🟢 Working |

\| Ahead triggering | 🟢 Working |

\| \~800m trigger behaviour | 🟢 Observed |

\| \`aheadDistanceM\` diagnostics | 🔴 Needs correction |

\| Duplicate cleanup | 🔴 Needs verification/fix |

\| Candidate deduplication | 🟡 Needs implementation/verification |

\| Content coverage | 🔴 Too sparse |

\| Personalization | ⏳ Not built |

\| AI narration | ⏳ Not built |

\| TTS | ⏳ Not built |

\| Offline packages | ⏳ Not built |

\| Mobile app | ⏳ Not built |

\| Monetization validation | ⏳ Not validated |

**## 40.1 Addendum — verified current status (2026-09-04)**

\| Component | Status | Evidence |

\|---|---|---|

\| Product concept | 🟢 Defined | unchanged |

\| Backend API | 🟢 Working | \`npm run build\` + \`npx tsc --noEmit\` clean |

\| PostgreSQL/PostGIS | 🟢 Working | live queries confirmed |

\| \`content\` table | 🟢 Working | unchanged |

\| \`content\_translations\` | 🟢 Working | unchanged |

\| Content API | 🟢 Working | centralized error handling + UUID param validation added |

\| Content importer | 🟢 Idempotent — verified | reran \`npm run import-content\` twice; row count unchanged (105 total, 105 distinct \`content\_key\`) |

\| Curated stories | 🟢 99 active (was 32) | \`delhi-nainital-content-v1.json\`, all imported and verified |

\| Journey simulator | 🟢 Working | \`npm test\` (22/22 passing) |

\| Route simulation | 🟢 Working, route geometry fixed | stored \`route\_geometry\` replaced with a real OSRM road-following route (was a coarse polyline missing towns like Moradabad) |

\| Ahead triggering | 🟢 Working | unchanged |

\| \~800m trigger behaviour | 🟢 Observed | unchanged |

\| \`aheadDistanceM\` diagnostics | 🟢 Fixed | \`decisionAheadDistanceM\` and \`triggerAheadDistanceM\` are now distinct, correct fields, covered by tests |

\| Duplicate cleanup | 🟢 Fixed & verified | unique index \`content\_content\_key\_uidx\` confirmed live; 105/105 distinct keys |

\| Candidate deduplication | 🟢 Verified, monitored | \`findNearRoute()\` returns one row per content id by construction; \`diagnostics.duplicateCandidates\` added as an ongoing regression canary (currently \`[]\`) |

\| Content coverage | 🟢 Fixed | real route: \`longestGapKm\` 61→31.3, \`uncoveredStretches\` 1→0, \`storyCount\` 12→16 |

\| Simulator quality reporting | 🟢 Done | added \`longestGapMinutes\`/\`avgGapMinutes\` alongside km metrics |

\| Error handling / input validation | 🟢 Done (not in original doc) | centralized error handler, UUID param validation, clean 400s instead of leaking DB/stack errors |

\| Test coverage | 🟢 Done (not in original doc) | 22 tests: recommendation engine (13) + journey routes integration (9) via \`app.inject()\` |

\| Offline packages | 🟡 Partially built (was ⏳ Not built) | \`/v1/journeys/\:id/package\` (JSON + zip) with manifest, \`contentVersion\`, \`expiresAt\`; no audio/TTS yet |

\| Personalization | ⏳ Not built | unchanged, deliberately deferred |

\| AI narration | ⏳ Not built | unchanged, deliberately deferred |

\| TTS | ⏳ Not built | unchanged, deliberately deferred |

\| Mobile app | ⏳ Not built | unchanged — explicit user decision to defer, basic \`mobile-shell/\` demo shell only |

\| Monetization validation | ⏳ Not validated | unchanged |


**## 40.2A — Product direction: location-first recommendation model**

The recommendation model is being simplified based on the latest product direction and playback findings.

The core idea is intentionally simple:

> **Wherever you are driving, look around you, find the interesting things nearby, and tell me the best ones at the right time.**

The traveller’s **current GPS location is the primary input**. The system should search for interesting content in a configurable radius around that location, filter unsuitable candidates, rank the remaining candidates, and speak the best one when pacing allows.

This replaces the more complex multi-intent architecture previously proposed in this document. Do **not** implement separate static modes such as `roadside`, `ahead_recommendation`, `area_context`, `destination_context`, or `detour_recommendation` for the MVP.

### Core model

```text
GPS / current location
        ↓
Search interesting content around current location
        ↓
10–25 km retrieval radius
        ↓
Eligibility filters
        ↓
Calculate simple current-location relationship
        ↓
Existing deterministic scorer
        ↓
Cooldown / pacing
        ↓
Select best story
        ↓
Natural narration
        ↓
Repeat as traveller moves
```

### Content remains journey-agnostic

Content should describe **what exists**, not how it should behave on a particular journey.

A content record should primarily contain intrinsic information such as:

- geographic position or geographic scope
- category
- tags
- interestingness
- source confidence
- editorial quality
- story/content type
- source and provenance
- narration metadata

Do **not** add permanent journey-specific classifications such as:

- `destination`
- `roadside`
- `ahead_recommendation`
- `detour_recommendation`

The same story must work regardless of the traveller’s origin and destination.

For example, a Muzaffarnagar food shop is simply a Muzaffarnagar food story. If the traveller happens to be driving toward Muzaffarnagar, it may naturally become relevant when it enters the useful search area. If the traveller is driving somewhere else, the same content is evaluated from that new location.

### Search radius

Use the radius primarily for **candidate retrieval**, not as a hard rule for when narration must happen.

Recommended initial behavior:

```text
Preferred search radius: ~10–15 km
Maximum search radius:   ~25 km
```

The exact value should be configurable.

A practical strategy is:

```text
Start with ~10 km
        ↓
If candidate pool is sparse
        ↓
Expand toward ~15 km
        ↓
If still sparse
        ↓
Expand up to ~25 km
```

This avoids unnecessarily searching a huge area in dense locations while still giving the system enough candidates in rural or lower-content areas.

The radius is a **retrieval boundary**. A candidate 15 km away does not necessarily need to be narrated immediately. Timing should depend on distance, direction, travel speed/ETA when available, and the normal pacing rules.

### Candidate → current-location relationship

Keep the runtime relationship intentionally small.

For a candidate, calculate only what is useful to recommendation timing, for example:

```typescript
CandidateContext {
  distanceFromUserM
  bearingFromUser
  isAhead?
  etaMinutes?
  routeDistanceM?
}
```

Not every field is mandatory.

- `distanceFromUserM` is always useful.
- `bearingFromUser` / `isAhead` can be used when heading or route geometry is available.
- `etaMinutes` and `routeDistanceM` are optional route context.
- Route context should improve timing, but **must not be required for the basic recommendation model**.

Do not introduce a large candidate–journey relationship object containing destination distance, detour cost, journey phase, area relationship, or multiple intent classifications unless a later validated product requirement proves that it is necessary.

### Route is supporting context, not the product model

If an active route is available, use it to improve recommendation quality:

- determine whether something is generally ahead or behind
- estimate route distance
- estimate arrival time
- avoid recommending obviously unreachable/behind candidates

But the route should not define the content taxonomy.

The product must also work from GPS/current location without requiring a complex route model.

### Ranking

Reuse the existing deterministic recommendation scorer rather than creating separate ranking systems.

The candidate should be evaluated using the existing quality signals plus the current-location relationship. The proximity component should evolve from primarily **distance-to-route** toward **distance/relevance from the traveller’s current location**, while preserving the existing quality and safety thresholds unless playback evidence justifies a change.

Conceptually:

```text
interestingness
+ traveller interest match
+ source confidence
+ proximity to current location
+ novelty
+ category diversity
+ optional ahead/timing signal
--------------------------------
= recommendation score
```

The exact existing V2 weights should not be changed merely because the retrieval model changes. First run playback with the simpler location-first retrieval and inspect the narrated sequence.

### Timing and pacing

Timing remains the important non-trivial part of the simplified design.

A 15 km-away story may be worth introducing before the traveller reaches it, while a story 800 m away may be better narrated immediately. The system therefore needs **one simple pacing/timing layer**, not multiple trigger modes.

The MVP can use:

- cooldown after narration
- minimum movement/decision interval
- candidate distance
- optional ETA
- optional ahead/behind status
- minimum recommendation score

Example:

```text
GPS update / decision point
        ↓
Find candidates within retrieval radius
        ↓
Filter + score
        ↓
If cooldown active → wait
        ↓
If top score below threshold → wait
        ↓
Otherwise → narrate best candidate
```

Do not speak simply because a candidate entered the radius.

### Continuous location search fixes the current end-of-route issue

The latest playback exposed a structural issue in the route-fraction simulator: a high-quality candidate near the route end can have `timesConsidered = 0` because the next decision pass occurs after the route has already ended.

The location-first model should avoid this by making the recommendation loop based on **current simulated GPS position**, rather than only on route-fraction windows.

Conceptually:

```text
Simulated GPS position
        ↓
Radius search around that position
        ↓
Evaluate candidates
        ↓
Advance simulated vehicle position
        ↓
Repeat
```

This means a candidate near the final area is still evaluated as soon as it enters the retrieval radius, subject only to cooldown and score thresholds.

### Retrieval vs narration timing

Keep these concerns separate:

**Retrieval:**
> What interesting content exists around me?

**Recommendation:**
> Which of those candidates is best right now?

**Narration timing:**
> Is now a good moment to tell the traveller?

This separation prevents the search radius from becoming an accidental trigger rule.

### Candidate state and diagnostics

Maintain a distinction between:

- `played` — the traveller has already heard the story
- `evaluated` — the candidate was actually considered by the recommendation engine
- `retrieved` — the candidate was returned by the location search
- `eligible` — the candidate passed eligibility filters
- `selected` — the candidate won recommendation

Playback diagnostics should make these states visible.

For every relevant candidate, report where possible:

- retrieval count
- evaluation count
- eligible count
- selected count
- last evaluation distance
- rejection reason(s)
- cooldown skips
- below-threshold skips
- not-evaluated-before-journey-end

This is especially important because **not selected** and **never evaluated** are different problems.

### Sparse and dense areas

The retrieval strategy should adapt to content density without changing the product model.

Dense area:

```text
10 km search → many candidates → rank tightly
```

Sparse area:

```text
10 km → few candidates
15 km → expand
25 km → final retrieval boundary
```

Do not solve sparse areas by lowering quality thresholds or inventing/moving coordinates.

### What this model intentionally does NOT do

For the MVP, do not build:

- static destination classification
- five separate recommendation modes
- destination-specific content metadata
- detour optimization
- large journey-context objects
- ML/LLM candidate selection
- complex trigger-window configuration per content type
- route-dependent content labeling

If a future requirement needs one of these, introduce it only after a concrete user scenario and playback evidence demonstrate that the simple model cannot handle it.

### Product framing

The simplest product explanation is now:

> **You’re driving somewhere. We’ll look around you and tell you the interesting things you might otherwise miss.**

The existing positioning can remain as supporting language:

> **Navigation tells you where to go. Journey Companion tells you what you’re passing through.**

The key product promise is not a particular trigger mode or destination model. It is **contextual discovery while travelling**.

**## 40.2 Addendum — verified current status (2026-09-12)**

\> Second real-world test corridor added: **Noida Extension → Muzaffarnagar** (journey id \`433368e4-5bc0-44e2-bfe1-3e428317cfa0\`, 113.9 km real OSRM route), used alongside Delhi → Nainital to stress-test the recommendation engine against a shorter, denser candidate pool.

\| Component | Status | Evidence |

\|---|---|---|

\| Noida Extension → Muzaffarnagar content pool | 🟢 179 main candidates + 19 gap-fill candidates imported | \`noida-extension-to-muzaffarnagar-content-v1.json\`, \`noida-extension-muzaffarnagar-gap-fill-content-v1.json\` |

\| Gap-fill data-duplication bug | 🟢 Fixed | All 19 gap-fill records originally had identical \`shortDescription\`/\`longDescription\`/\`narrationHint\` text; replaced with corrected file (\`...-gap-fill-content-v1.json\`), re-imported, 11 previously-verified records re-verified |

\| Narration duplication bug (systemic, code-level) | 🟢 Fixed | \`buildNarrationPreview()\` in \`backend/src/modules/recommendation/scorer.ts\` and the story-building loop in \`backend/src/modules/journey/package.ts\` were embedding the \`cue\` (\`narration_hint\`) directly inside the narrated \`summary\` text, while the UI/TTS also rendered \`cue\` a second time as a separate "Cue:" line — every story's cue sentence was said/shown twice. Removed \`cue\` from the \`summary\` concatenation in both files; \`cue\` is still surfaced once via the dedicated \`narration.cue\` field |

\| Build/tests after narration fix | 🟢 Verified | \`npx tsc --noEmit\` clean; \`npm test\` 22/22 passing (requires network access to the Postgres container in sandboxed environments) |

\| Noida Extension → Muzaffarnagar playback (post-fix) | 🟢 Unchanged, re-confirmed | 8 stories triggered, 4.21 stories/hour, avg gap 12.7 km, max gap 30.4 km |

\| "Never-triggered candidate" diagnosis capability | 🟢 Demonstrated | \`backend/reports/playback-\<journeyId\>.json\` \`neverTriggeredCandidates\` array (with \`timesConsidered\`/\`timesEligible\`/\`topSkipReasons\`) used to explain, with evidence, why specific high-scoring content (e.g. a verified, interestingness-8.5, confidence-0.96 Muzaffarnagar sugar-industry fact) did not narrate |

\| New structural gap class identified | 🟡 Noted, not yet fixed | Candidates positioned very close to the **end of the route** can have \`timesConsidered = 0\` (never even evaluated) if the last triggered story's cooldown (\`minGapMinutes\`, default 8 min ≈ 8 km) pushes the next decision window past the route's finish line. This is distinct from "outscored" rejections and currently has no mitigation (e.g. no forced final decision pass near the destination) |

\| Operational gotcha (re-import resets verification) | 🟡 Known limitation, not fixed | Re-running \`import-content\` resets \`verified\`/\`review_status\` on **all** matching rows, including previously-verified ones; manual re-verification SQL is required after every re-import until the importer is made verification-preserving |

\---

**# 41. FIRST TASK FOR THE AI AGENT**

When taking over the repository, do **not** immediately rewrite the recommendation engine.

Perform this audit first:
```text
1. Inspect repository tree.
2. Inspect package.json.
3. Inspect tsconfig.json.
4. Inspect database schema.
5. Inspect all migrations.
6. Inspect content importer.
7. Inspect recommendation engine.
8. Inspect journey simulator.
9. Inspect playback-report and playback metrics.
10. Inspect current Noida Extension → Muzaffarnagar reports.
11. Inspect tests.
12. Run npm install if needed.
13. Run npm run build / tsc.
14. Run npm test.
15. Run importer against development DB if appropriate.
16. Run the existing simulator/report.
17. Compare actual output with this document.
18. Report discrepancies before changing behaviour.
19. Only then implement the smallest tested change required by the current milestone.
```

## Current implementation milestone

The immediate recommendation-system milestone is now **Dynamic Candidate–Journey Relevance + Journey Experience Validation**, not a wholesale scoring rewrite.

First implement/validate the diagnostic foundation:

```text
Candidate retrieval
↓
Dynamic candidate–journey relationship derivation
↓
Runtime recommendation intent
↓
Eligibility diagnostics
↓
Decision-pass accounting
↓
Shared deterministic ranking
↓
Playback report
```

The first code changes should make it possible to answer:

```text
Was this candidate retrieved?
What trigger mode was it using?
Was it in its valid trigger window?
Was it ahead / behind / destination-context / detour?
Was a decision pass actually executed while it was eligible?
Was it blocked by cooldown?
Was it scored and outscored?
Did the journey end before it got a decision opportunity?
```

Then validate the following concrete scenarios:

1. A roadside landmark is introduced before the traveller reaches it.
2. A famous food shop several km ahead can be surfaced as an ahead recommendation.
3. A worthwhile off-route food/attraction candidate can be surfaced when its detour is acceptable.
4. A city/area fact can trigger while approaching the city rather than requiring the exact content point to be crossed.
5. A destination fact near the final kilometres still receives a decision opportunity even if the normal cooldown would otherwise push the next decision beyond route end.
6. A high-interest candidate that is never evaluated is clearly distinguished from one that was evaluated and lost.

Do **not** change recommendation weights, lower quality thresholds, or introduce LLM selection until these cases are observable in playback and tests.

**# 42. Final Handoff Instruction**

You are taking over an existing Journey Companion project.

> **Do not restart it.**

Already built and verified in the current repository include:
- backend
- PostgreSQL/PostGIS
- content API
- content translations
- idempotent importer by `content_key`
- curated Delhi → Nainital content
- Noida Extension → Muzaffarnagar content and gap-fill datasets
- deterministic recommendation engine
- journey simulator
- real OSRM road-following routes
- ahead-of-traveller triggering
- decision-vs-trigger distance diagnostics
- database-level content-key uniqueness
- candidate deduplication diagnostics
- simulator/playback quality metrics
- narration preview and cue/summary separation fix
- partially built offline journey package

Current verified Noida Extension → Muzaffarnagar result:
```text
Route: 113.9 km
Triggered stories: 8
Stories/hour: 4.21
Average gap: 12.7 km
Maximum observed gap: ~30 km
Never-triggered candidates: 57 in the report at the time of the latest diagnostic run
```

A critical diagnostic finding is now established:

> A candidate can be high quality, geographically valid and highly interesting, yet have `timesConsidered = 0` because no recommendation decision pass occurs before the journey ends.

The verified example is the Muzaffarnagar sugar-industry fact (`interestingness 8.5`, confidence `0.96`, approximately 421m from the route) positioned around km 113.8 on a 113.9km route. The last narration occurred around km 108.7 and the 8-minute cooldown pushed the next normal decision beyond the route end. This is a **decision-scheduling / end-of-route problem**, not a content-quality or ranking problem.

## Current product direction — simplified MVP model (v2.7)

The MVP is intentionally removing ranking and numeric interestingness from the recommendation decision. We first need to validate the core discovery experience and collect playback evidence. Ranking can be reintroduced in a later phase once we have real observations about what travellers actually value.

The product loop is now:

> **Look around the traveller → find nearby candidates → filter for eligibility → apply simple proximity/pacing rules → tell the traveller → wait → repeat.**

The route is optional supporting context. The current GPS location is the primary signal.

### MVP architecture

```text
GPS / current location
 ↓
10–25 km candidate retrieval
 ↓
current-location relationship
 ↓
eligibility
  - active
  - verified / trusted source
  - family-friendly where required
  - not already played
 ↓
simple proximity / contextual ordering
 ↓
cooldown / pacing
 ↓
narration
```

### Important MVP decision: no ranking yet

Do not use `interestingness`, `editorialScore`, weighted scoring, novelty scoring, category-diversity scoring, or source-confidence weighting to decide which story wins during this phase.

Existing ranking/scoring code may remain in the repository for historical/reference purposes, but the active MVP path should not depend on it. Do not delete working code unnecessarily; isolate or bypass it cleanly so the simpler behavior can be tested.

The content database may retain legacy `interestingness` / `editorialScore` values while the migration is in progress, but **new content does not need these fields for MVP recommendation**. They should not be used as hidden ranking signals.

`confidence`, `verified`, `sourceName`, and `sourceUrl` remain useful as **content-quality/provenance metadata**. They are not ranking weights in the MVP.

### Content philosophy

The immediate goal is to build a broad, trustworthy collection of things a traveller might genuinely want to know about:

- physical landmarks
- bridges and canals
- rivers and water infrastructure
- railway and highway engineering
- factories and local manufacturing
- agriculture and agricultural science
- local food and famous food stops
- sweets and regional specialties
- history and culture
- temples, museums and monuments
- unusual local facts
- family-friendly discoveries

A food place does not need a numeric score. For example, a famous highway food stop can simply be represented as a nearby `food` candidate with trustworthy source information, actual coordinates and a description of what it is known for.

### Food content

Food is now an explicit content area for the MVP. Focus on:

1. famous local specialties (e.g. Muzaffarnagar gur, Meerut rewri/gajak)
2. famous sweets / traditional shops
3. established highway food stops
4. notable dhabas/restaurants directly on or close to the driving corridor
5. food places with a meaningful local story

Do not turn the food dataset into a generic restaurant directory. The goal is **journey-relevant discovery**, not exhaustive restaurant coverage.

### Candidate ordering for MVP

When several eligible candidates are nearby, prefer the simplest explainable ordering available, primarily based on the relationship to the current location. For example:

```text
nearest relevant candidate
        ↓
not already played?
        ↓
within useful retrieval/context range?
        ↓
cooldown satisfied?
        ↓
speak
```

If several candidates are effectively equivalent, deterministic tie-breaking is acceptable. Do not invent a hidden quality score.

## Implementation guardrails

### Do
- keep content journey-agnostic
- use current GPS location as the primary retrieval input
- use a configurable 10–25 km retrieval radius
- expand the radius when the candidate pool is genuinely sparse
- keep retrieval radius separate from narration timing
- use route distance / ETA / ahead-behind information only as supporting context when available
- preserve explainability
- distinguish `retrieved`, `evaluated`, `eligible`, `selected` and `played` states
- fix the final-area evaluation problem in the simulator
- collect playback evidence before introducing ranking
- keep source confidence and provenance independent from recommendation priority
- keep physical coordinates tied to the actual subject; never move coordinates just to make content trigger

### Do not
- require `interestingness` or `editorialScore` for new MVP content
- use the old weighted scorer as an implicit hidden ranking layer
- create five separate recommendation modes for the MVP
- add static `destination` / `roadside` / `ahead_recommendation` classifications
- add complex destination/detour/journey-phase metadata without evidence
- lower quality/provenance requirements just to increase story count
- move content coordinates artificially
- use LLM/ML selection for the MVP
- generate large batches of generic content to compensate for weak discovery
- make route geometry mandatory for basic recommendation
- treat the retrieval radius as an automatic narration trigger
- rewrite the whole recommendation engine unnecessarily

## Recommended engineering sequence

```text
1. Preserve the existing repository and historical scorer code
↓
2. Make location-radius retrieval the active MVP candidate source
↓
3. Keep simple eligibility / provenance checks
↓
4. Remove ranking weights from the active decision path
↓
5. Use current-location proximity/context as the primary ordering signal
↓
6. Add simple cooldown / pacing
↓
7. Update simulator to use simulated GPS + radius search
↓
8. Improve retrieved/evaluated/eligible/selected/played diagnostics
↓
9. Build high-quality content across landmarks, food, infrastructure, industry, agriculture, nature and local culture
↓
10. Run Noida Extension → Muzaffarnagar playback
↓
11. Run Delhi → Nainital playback
↓
12. Review actual narrated sequence and silent stretches
↓
13. Test with real driving / 5–10 users
↓
14. Collect evidence about skips, plays, proximity and content preferences
↓
15. Only then design Phase 2 ranking / personalization
```

## Phase 2 — future ranking, not an MVP requirement

Once real playback data exists, revisit ranking. Possible future signals include:

- content quality
- user interest/preferences
- proximity
- novelty
- context
- popularity / observed engagement
- category diversity
- time and journey state

These are **future hypotheses**, not current implementation requirements. The eventual ranking system should be derived from observed user behavior rather than assigning arbitrary 0–10 interestingness scores to content in advance.

## Final product test

The central question for the current phase is:

> **If I turn on Journey Companion while driving, does it reliably find useful or interesting things around me and tell me about them at sensible moments without becoming annoying?**

We do not need to prove that the system can rank the “best” story yet. We need to prove that the system can **discover, retrieve, filter, pace and narrate good content reliably**.

If that works, Phase 2 can use real playback evidence to determine what “best” should mean.
