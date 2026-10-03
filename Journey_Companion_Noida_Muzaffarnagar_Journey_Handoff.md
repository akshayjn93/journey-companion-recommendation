# Journey Companion — Journey Handoff
## Noida Extension → Muzaffarnagar

**Journey:** Noida Extension – Ek Murti Chowk → Muzaffarnagar – Mahavir Chowk  
**Primary corridor:** Delhi–Meerut Expressway, then Meerut–Muzaffarnagar corridor  
**Purpose:** Regular test journey for validating Journey Companion’s recommendation, pacing, narration, and route-awareness behavior.

---

## 1. Journey Objective

Use this journey as the main development/test route for checking whether Journey Companion can turn a normal drive into a contextual discovery experience.

The target experience is:

> Navigation tells the traveller where to go. Journey Companion tells them what they are passing through.

The system should surface relevant, interesting, geographically appropriate stories ahead of the traveller without overwhelming them.

---

## 2. Route

**Start:** Ek Murti Chowk, Noida Extension  
**End:** Mahavir Chowk, Muzaffarnagar

Expected high-level route:

1. Noida Extension / Greater Noida West
2. Ghaziabad-side approach
3. Delhi–Meerut Expressway
4. Dasna / Hindon / Modinagar area
5. Meerut
6. Meerut → Muzaffarnagar corridor
7. Muzaffarnagar
8. Mahavir Chowk

**Important:** Do not assume the Delhi–Meerut Expressway covers the entire journey. It is the Delhi–Meerut portion; the route continues from Meerut toward Muzaffarnagar.

Exact route geometry and story trigger locations must be validated against the actual OSRM route used by the application.

---

## 3. Content Dataset

A candidate content pool has been created:

**File:** `noida-extension-to-muzaffarnagar-content-v1.json`

Current size:

- **179 candidate stories**
- English + Hindi translations
- Categories include:
  - History
  - Culture
  - Industry
  - Religion
  - Infrastructure
  - Archaeology
  - Museums
  - Architecture
  - Agriculture
  - Food
  - Education
  - Administration
  - Road safety

The dataset contains multiple angles around some factual clusters. These are intentional alternatives, not necessarily separate stories that should all trigger during one journey.

### Content rule

**Do not blindly import and expose all 179 stories.**

Treat the dataset as a research-backed candidate pool:

`Candidate content → DB import → actual route → simulator → playback report → editorial review → final journey content`

---

## 4. Important Content Areas

The route provides several strong story zones:

### Ghaziabad / DME approach
- Hindon River and local history
- 1857 events around Hindon
- Dasna
- Archaeological/ancient settlement context
- Delhi–Meerut Expressway development
- Expressway infrastructure and road-safety context

### Modinagar
- Begumabad → Modinagar history
- Modi industrial legacy
- Local temples and cultural landmarks
- Industrial development

### Meerut
- 1857 uprising / 10 May 1857
- Meerut Cantonment
- Sports-goods industry
- Musical instruments
- Scissors manufacturing
- Publishing
- Sugar and engineering industries
- Nauchandi Mela
- Augarnath Temple
- St John’s Church
- Shahpeer Dargah
- Gandhi Bagh
- Suraj Kund
- Shaheed Smarak / Freedom Struggle Museum
- Jain heritage
- Parikshitgarh / Hastinapur context where geographically appropriate

### Meerut → Muzaffarnagar
- Agriculture and sugar economy
- Western UP cultural context
- Local towns and historical places
- Jaggery / gur economy
- Khatauli
- Regional religious and Jain heritage

### Muzaffarnagar
- City founding/history
- Sarvat / Muzaffar Khan history
- Mandi archaeological context
- Sugar industry
- Steel/paper industries
- Agriculture
- Gur market
- Vahelna Jain heritage
- Museums
- Local temples and cultural sites

---

## 5. Recommendation / Trigger Expectations

Use the existing Recommendation Engine V2.

Current weighting:

- Interestingness — 30%
- Interest/category fit — 20%
- Source confidence — 15%
- Proximity — 10%
- Novelty — 10%
- Category diversity — 10%
- Ahead timing — 5%

Current spatial expectations:

- Search radius: ~5 km
- Preferred ahead distance: ~0.8–3 km
- Maximum ahead distance: ~5 km
- Behind tolerance: ~250 m
- Minimum narration gap: ~8 minutes
- Practical trigger sweet spot: ~800 m–2 km

These values should be treated as the current baseline, not permanent values.

---

## 6. First Validation Task

After importing the candidate content and creating the journey, run the simulator and generate a **Journey Playback Report**.

The report should show, chronologically:

- Story trigger time
- Distance from journey start
- Story title
- Category
- Recommendation score
- Score breakdown
- Decision distance
- Trigger distance
- Gap since previous story
- Silent stretches
- Candidate stories considered
- Rejected candidates and rejection reasons
- Never-triggered high-quality candidates

The objective is to evaluate the actual journey experience rather than only checking that the recommendation engine technically works.

---

## 7. Editorial Review

For the first playback:

1. Review the first ~20–30 triggered stories.
2. Identify duplicates/repetitive angles.
3. Check whether stories are genuinely ahead of the traveller.
4. Check whether a story makes sense from the road, not just geographically.
5. Check category diversity.
6. Check whether long silent stretches feel acceptable.
7. Identify strong candidates that never trigger.
8. Remove weak or redundant stories before adding more content.

**Do not optimize for maximum story count. Optimize for journey quality.**

---

## 8. Special Handling

Some content refers to places such as Hastinapur or Parikshitgarh that may be interesting but may not be directly roadside.

These should be treated as **context/detour candidates** unless the actual route and distance make them appropriate.

Coordinates in the candidate dataset are approximate research coordinates. They must be validated before being treated as precise trigger locations.

---

## 9. Next Product Experiments

After the baseline playback is acceptable:

### Phase 1
- Validate story sequence
- Tune pacing
- Remove redundancy

### Phase 2
Prototype AI narration on ~10 stories.

Test:
- Natural spoken language
- 20–40 second narration
- Hindi/English quality
- Whether narration adds value beyond the raw story text

### Phase 3
Experiment with narration frequency:

- ~8 minutes
- ~12–15 minutes
- ~20 minutes

Compare perceived journey quality.

### Phase 4
Build a minimal real-driving prototype and test this route with real users.

Target:
- 5–10 test users/drives

Only after this should we expand content aggressively, add personalization, richer offline packages, production mobile UX, and monetization.

---

## 10. Definition of Success

This journey is successful when a traveller can drive from Noida Extension to Muzaffarnagar and feel that Journey Companion is:

- Relevant
- Timely
- Interesting
- Non-repetitive
- Geographically aware
- Not too talkative
- Useful even when the traveller knows the basic route

The key metric is **quality of discovery per minute of driving**, not the number of stories stored in the database.

---

## 11. Files

Primary content:

`noida-extension-to-muzaffarnagar-content-v1.json`

Dataset notes:

`noida-extension-to-muzaffarnagar-content-v1.meta.json`

This handoff should be used together with the main Journey Companion AI Agent Handoff document. The main project handoff defines the application architecture and current implementation status; this document defines the route-specific context and validation plan.
