-- Hive R&D — phase 3b additive migration.
-- Adds an event log so we can show each member their own progress over
-- time on the profile page: skills added/removed/raised, repos joined,
-- etc. Every change to rnd_member_skills or rnd_member_repos writes one
-- or more rows here.

create table if not exists rnd_member_events (
  id           uuid primary key default uuid_generate_v4(),
  member_id    uuid not null references rnd_members(id) on delete cascade,
  event_type   text not null check (event_type in (
    'skill_added','skill_removed','skill_level_change',
    'repo_added','repo_removed','snapshot'
  )),
  skill_id     uuid references rnd_skills(id) on delete set null,
  repo_id      uuid references rnd_repos(id) on delete set null,
  level_before int,
  level_after  int,
  occurred_at  timestamptz not null default now(),
  source       text default 'manual',
  -- snapshot rows of the same type/skill/repo on the same day are dedup'd
  -- via this composite hash; raw application-level (no DB constraint).
  notes        text
);

create index if not exists rnd_member_events_member_idx
  on rnd_member_events (member_id, occurred_at desc);
create index if not exists rnd_member_events_skill_idx
  on rnd_member_events (skill_id) where skill_id is not null;
create index if not exists rnd_member_events_repo_idx
  on rnd_member_events (repo_id) where repo_id is not null;
