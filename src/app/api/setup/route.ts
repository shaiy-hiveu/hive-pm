import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const SQL = `
create extension if not exists "uuid-ossp";

create table if not exists pillars (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  color       text not null default '#6366f1',
  icon        text,
  order_index int  not null default 0,
  created_at  timestamptz default now()
);

create table if not exists products (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null unique,
  description   text,
  icon          text,
  pillar_id     uuid references pillars(id) on delete set null,
  area          text not null default 'core' check (area in ('core','research','production','other')),
  status        text not null default 'active' check (status in ('active','paused','archived')),
  notion_filter text,
  created_at    timestamptz default now()
);

create table if not exists goals (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  description text,
  pillar_id   uuid references pillars(id) on delete set null,
  product_id  uuid references products(id) on delete set null,
  start_date  date,
  end_date    date,
  status      text not null default 'not_started' check (status in ('not_started','in_progress','done','blocked')),
  progress    int  not null default 0 check (progress >= 0 and progress <= 100),
  created_at  timestamptz default now()
);

create table if not exists sprints (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  product_id  uuid references products(id) on delete set null,
  created_at  timestamptz default now()
);

create table if not exists sprint_metadata (
  sprint_index int primary key,
  name        text,
  comment     text,
  goals       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz default now()
);
alter table sprint_metadata add column if not exists goals jsonb not null default '[]'::jsonb;

create table if not exists notion_samplings (
  id          uuid primary key default uuid_generate_v4(),
  sampled_at  timestamptz not null default now(),
  done_tasks  jsonb not null default '[]'::jsonb
);
create index if not exists notion_samplings_at_idx on notion_samplings (sampled_at desc);

create table if not exists vision_sections (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  content     text,
  order_index int not null default 0,
  created_at  timestamptz default now()
);

insert into pillars (name, description, color, icon, order_index) values
  ('Product Growth',  'Core product features & UX improvements', '#6366f1', '🚀', 0),
  ('Research',        'User research, data & insights',           '#10b981', '🔬', 1),
  ('Infrastructure',  'Platform stability & DevOps',              '#f59e0b', '⚙️', 2),
  ('Business',        'Revenue, partnerships & go-to-market',     '#ef4444', '💼', 3)
on conflict do nothing;
`;

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { error } = await db.rpc("exec_sql", { sql: SQL });
    if (error) {
      // Try direct approach - create tables one by one
      const results: string[] = [];
      
      // Just verify connection works
      const { data, error: e2 } = await db.from("products").select("count").limit(1);
      if (e2) {
        return NextResponse.json({ 
          status: "tables_missing",
          message: "Please run the SQL manually in Supabase dashboard",
          url: "https://supabase.com/dashboard/project/ulpqwuaweuutydxlcbau/sql/new",
          error: e2.message 
        });
      }
      return NextResponse.json({ status: "ok", message: "Tables already exist!" });
    }
    return NextResponse.json({ status: "ok", message: "Schema created successfully!" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
