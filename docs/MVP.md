# MVP Specification

## Goal
Prove that travellers enjoy a location-aware voice companion that surfaces verified, interesting information during a journey.

## Initial journey
Delhi → Nainital.

## Primary user story
As a traveller, I can start a journey, choose interests, and hear short, relevant facts/stories as I approach locations on my route.

## Functional requirements

### Journey setup
- Enter origin and destination.
- Select interests.
- Download/prepare journey content while online.

### Location
- Read GPS position.
- Determine proximity to route content.
- Avoid repeated triggers.
- Enforce a minimum interaction gap.

### Content
- Only verified content can be surfaced.
- Every content item has a geographic point and category.
- Content is tagged for interests.

### Narration
- 15–40 seconds for normal discoveries.
- Conversational, not encyclopedic.
- Must not introduce unsupported facts.

### Offline
- Route content and audio are available locally after download.
- GPS-based triggering continues without internet.
- Live Q&A is optional when offline.

## Non-functional
- No precise location history retained by default.
- API calls authenticated before public beta.
- Content provenance retained.
- Every surfaced fact must be traceable to a source.

## MVP success metrics
- % of triggered stories played to completion.
- % of stories skipped.
- Follow-up questions per journey.
- Repeat journey usage.
- User rating: “Did this make your journey more interesting?”
- Willingness to pay for a journey pack.
