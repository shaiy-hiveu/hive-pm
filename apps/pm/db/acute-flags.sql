-- Hive PM — additive migration.
-- Lets the product owner mark a Notion task as "acute / right now" so it
-- floats to the top of the Hot Tasks panel and is visually separated
-- from the other urgent tasks.

create table if not exists pm_acute_flags (
  notion_page_id text primary key,
  flagged_at     timestamptz not null default now(),
  flagged_by     text
);
