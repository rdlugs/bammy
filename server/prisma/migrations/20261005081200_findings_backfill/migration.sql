-- Backfill: the findings of each change's latest finished run start out open.
-- Earlier runs are not replayed, and the author was never stored, so it stays
-- unknown until the change is reviewed again.
INSERT INTO "findings" (
    "id", "repository_id", "number", "fingerprint", "title", "file", "start_line",
    "severity", "category", "kind", "change_title", "last_job_id", "first_seen_at", "last_seen_at"
)
SELECT DISTINCT ON (latest."repository_id", latest."number", f->>'fingerprint')
    gen_random_uuid(), latest."repository_id", latest."number", f->>'fingerprint', f->>'title', f->>'file',
    (f->>'startLine')::int, f->>'severity', f->>'category', f->>'kind',
    COALESCE(latest."result"->'change'->>'title', ''), latest."id", latest."created_at", latest."created_at"
FROM (
    SELECT DISTINCT ON ("repository_id", "number") "id", "repository_id", "number", "result", "created_at"
    FROM "review_jobs"
    WHERE "status" IN ('completed', 'partial') AND "result" IS NOT NULL
    ORDER BY "repository_id", "number", "created_at" DESC, "id" DESC
) latest
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(latest."result"->'findings', '[]'::jsonb)) f
WHERE f->>'fingerprint' IS NOT NULL
ON CONFLICT DO NOTHING;
