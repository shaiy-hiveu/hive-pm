-- Hive R&D — replace placeholder repos with the actual GitHub repo list.
-- Run once in the Supabase SQL Editor after Phase 1 + Phase 2 schema.

-- Drop the 5 high-level placeholder repos seeded in Phase 1 — we are
-- replacing them with the granular GitHub repo list. Cascade on
-- rnd_member_repos.repo_id removes any links automatically.
delete from rnd_repos
where slug in ('hivedashboard', 'political-radar', 'hivemind', 'streamlit-tools', 'ingestion');

-- The 29 active GitHub repos. Color codes language:
--   #6366f1 indigo  TypeScript
--   #3b82f6 blue    Python
--   #eab308 yellow  JavaScript
--   #f97316 orange  HTML
--   #8b5cf6 violet  HCL (Terraform)
--   #9ca3af gray    no primary language declared
insert into rnd_repos (name, slug, tech_summary, status, color, order_index) values
  ('political-radar',                'political-radar',                'TypeScript',                       'active',     '#6366f1', 100),
  ('server-internal-STOP-USING',     'server-internal-stop-using',     'Python · STOP USING',              'deprecated', '#3b82f6', 110),
  ('StreamlitForNov16',              'streamlitfornov16',              'Python (Streamlit)',               'active',     '#3b82f6', 120),
  ('client-internal-STOP-USING',     'client-internal-stop-using',     'TypeScript · STOP USING',          'deprecated', '#6366f1', 130),
  ('Narrative_imapct_lambda',        'narrative-imapct-lambda',        'Python · Lambda',                  'active',     '#3b82f6', 140),
  ('hivemind',                       'hivemind',                       'TypeScript',                       'active',     '#6366f1', 150),
  ('server-v2',                      'server-v2',                      'TypeScript',                       'active',     '#6366f1', 160),
  ('networks-ingestion',             'networks-ingestion',             'Python',                           'active',     '#3b82f6', 170),
  ('news-topics-alerts-lambda',      'news-topics-alerts-lambda',      'Python · Lambda',                  'active',     '#3b82f6', 180),
  ('client-v2',                      'client-v2',                      'TypeScript',                       'active',     '#6366f1', 190),
  ('hive-demo-28-4',                 'hive-demo-28-4',                 'JavaScript',                       'active',     '#eab308', 200),
  ('Dana-Raz',                       'dana-raz',                       'Python',                           'active',     '#3b82f6', 210),
  ('db-monitor-lambda',              'db-monitor-lambda',              'Python · Lambda',                  'active',     '#3b82f6', 220),
  ('meta-daily-report-lambda',       'meta-daily-report-lambda',       'Python · Lambda',                  'active',     '#3b82f6', 230),
  ('articles-to-topics-lambda',      'articles-to-topics-lambda',      'Python · Lambda',                  'active',     '#3b82f6', 240),
  ('commanage-dashboard',            'commanage-dashboard',            'HTML',                             'active',     '#f97316', 250),
  ('commanage-dashboard-bank',       'commanage-dashboard-bank',       'HTML',                             'active',     '#f97316', 260),
  ('narratives-v2-lambda',           'narratives-v2-lambda',           'Python · Lambda',                  'active',     '#3b82f6', 270),
  ('template-lambda',                'template-lambda',                'HCL (Terraform) · Lambda template','active',     '#8b5cf6', 280),
  ('survey-boards-rag-lambda',       'survey-boards-rag-lambda',       'Python · Lambda · RAG',            'active',     '#3b82f6', 290),
  ('hive-api',                       'hive-api',                       'Python',                           'active',     '#3b82f6', 300),
  ('bennett-segmentation-dashboard', 'bennett-segmentation-dashboard', 'Python',                           'active',     '#3b82f6', 310),
  ('db-management-lambda',           'db-management-lambda',           'Python · Lambda',                  'active',     '#3b82f6', 320),
  ('main-infra',                     'main-infra',                     'Infrastructure',                   'active',     '#9ca3af', 330),
  ('tweets-to-articles-lambda',      'tweets-to-articles-lambda',      'Python · Lambda',                  'active',     '#3b82f6', 340),
  ('weekly-arabic-report-lambda',    'weekly-arabic-report-lambda',    'HCL (Terraform) · Lambda',         'active',     '#8b5cf6', 350),
  ('n8n',                            'n8n',                            'HCL (Terraform)',                  'active',     '#8b5cf6', 360),
  ('nar-impact',                     'nar-impact',                     'Infrastructure',                   'active',     '#9ca3af', 370),
  ('hive-pm',                        'hive-pm-repo',                   'TypeScript · This monorepo',       'active',     '#6366f1', 380)
on conflict (name) do nothing;
