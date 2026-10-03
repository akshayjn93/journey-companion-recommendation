# Next steps

1. Run the V2 simulator and inspect the selected story plus alternatives.
2. Increase route content density; do not lower quality thresholds merely to fill gaps.
3. Add a real GPS/current-position API contract after simulator behaviour is stable.
4. Add traveller preference learning after deterministic ranking is validated.
5. Add LLM narration only after selection quality is proven.


## V2.1 immediate step

Before evaluating the next simulator run, apply `db/migrations/003_content_key_and_dedupe.sql`. This cleans duplicate content rows and establishes stable content identity. Then run `npm run import-content` again; the importer is safe to rerun.
