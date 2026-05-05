-- Hive R&D — small additive migration.
-- Adds an explicit notion_assignee_name column so members whose Notion
-- "Assigned to" value differs from their human-readable full_name (e.g.
-- "Max" vs "Max Overbeck", or "shai_y@hiveurban.com" vs "Shai Yagur") can
-- be matched correctly without losing their display name.

alter table rnd_members
  add column if not exists notion_assignee_name text;

create index if not exists rnd_members_notion_assignee_idx
  on rnd_members (notion_assignee_name) where notion_assignee_name is not null;
