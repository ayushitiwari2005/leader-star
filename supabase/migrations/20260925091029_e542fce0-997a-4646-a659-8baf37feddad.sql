create type public.app_role as enum ('super_admin', 'admin', 'viewer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('super_admin', 'admin'))
$$;

create policy "Users can read their own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "Super admins can manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(), 'super_admin')) with check (public.has_role(auth.uid(), 'super_admin'));

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  team_code text not null unique,
  name text not null,
  theme text not null default 'Food & Nutrition',
  members_count int not null default 4,
  acquired_business text,
  initial_capital numeric not null default 10000000,
  current_capital numeric not null default 10000000,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.teams to anon;
grant select, insert, update, delete on public.teams to authenticated;
grant all on public.teams to service_role;
alter table public.teams enable row level security;
create policy "Anyone can view teams" on public.teams for select to anon, authenticated using (true);
create policy "Admins can manage teams" on public.teams for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  day int not null default 1,
  max_score int not null default 100,
  weight numeric not null default 1,
  status text not null default 'upcoming',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.activities to anon;
grant select, insert, update, delete on public.activities to authenticated;
grant all on public.activities to service_role;
alter table public.activities enable row level security;
create policy "Anyone can view activities" on public.activities for select to anon, authenticated using (true);
create policy "Admins can manage activities" on public.activities for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  points numeric not null default 0,
  remarks text,
  entered_by uuid,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, activity_id)
);
grant select on public.scores to anon;
grant select, insert, update, delete on public.scores to authenticated;
grant all on public.scores to service_role;
alter table public.scores enable row level security;
create policy "Anyone can view scores" on public.scores for select to anon, authenticated using (true);
create policy "Admins can manage scores" on public.scores for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  performed_by uuid,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "Admins can view audit logs" on public.audit_logs for select to authenticated using (public.is_admin(auth.uid()));
create policy "Admins can add audit logs" on public.audit_logs for insert to authenticated with check (public.is_admin(auth.uid()));

alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.activities;
alter publication supabase_realtime add table public.scores;

insert into public.activities (name, description, day, max_score, weight, status, sort_order) values
  ('Workforce Wars', 'Organisational and people-management challenge', 1, 100, 1, 'completed', 1),
  ('TechSprint', 'Business + technology challenge', 1, 100, 1, 'completed', 2),
  ('Brand Blitz', 'Marketing and advertising challenge', 1, 100, 1, 'live', 3),
  ('SurviveX', 'Crisis-management challenge', 1, 100, 1, 'upcoming', 4),
  ('Capital Clash', 'Continuous fundraising and investment simulation', 1, 100, 1, 'upcoming', 5),
  ('The Boardroom', 'Final business defence challenge', 2, 150, 1.5, 'upcoming', 6),
  ('Viral Vault', 'Digital and social media visibility challenge', 2, 100, 1, 'upcoming', 7),
  ('E-Sports', 'Fun and sportsmanship element', 2, 50, 0.5, 'upcoming', 8);

insert into public.teams (team_code, name, theme, members_count, initial_capital, current_capital) values
  ('T01','Apex Vitals','Health & Fitness',5,10000000,21100000),
  ('T02','NutriForge','Food & Nutrition',4,10000000,18400000),
  ('T03','Loom & Line','Fashion & Lifestyle',5,10000000,16200000),
  ('T04','GreenCartel','Food & Nutrition',4,10000000,15500000),
  ('T05','Pulse & Plate','Health & Fitness',5,10000000,14900000),
  ('T06','Thread Theory','Fashion & Lifestyle',4,10000000,14100000),
  ('T07','MacroMinds','Food & Nutrition',5,10000000,13600000),
  ('T08','Vitality Labs','Health & Fitness',4,10000000,13000000),
  ('T09','Silk Signal','Fashion & Lifestyle',5,10000000,12400000),
  ('T10','Calorie Capital','Food & Nutrition',4,10000000,11800000),
  ('T11','Form & Function','Health & Fitness',5,10000000,11200000),
  ('T12','The Daily Dose','Food & Nutrition',4,10000000,10700000),
  ('T13','Warp Wardrobe','Fashion & Lifestyle',5,10000000,10100000),
  ('T14','Protein Pursuit','Health & Fitness',4,10000000,9600000),
  ('T15','Stitch Studio','Fashion & Lifestyle',5,10000000,9100000),
  ('T16','TerraBite','Food & Nutrition',4,10000000,8800000),
  ('T17','FlexFuel','Health & Fitness',5,10000000,8500000),
  ('T18','Velvet Circuit','Fashion & Lifestyle',4,10000000,8200000),
  ('T19','Harvest Hustle','Food & Nutrition',5,10000000,7900000),
  ('T20','Cardio Cartel','Health & Fitness',4,10000000,7600000),
  ('T21','Drape Dynamics','Fashion & Lifestyle',5,10000000,7300000),
  ('T22','Grain Gain','Food & Nutrition',4,10000000,7000000),
  ('T23','Zenith Fitness','Health & Fitness',5,10000000,6700000),
  ('T24','Couture Code','Fashion & Lifestyle',4,10000000,6400000),
  ('T25','SnackStack','Food & Nutrition',5,10000000,6100000),
  ('T26','IronPulse','Health & Fitness',4,10000000,5800000),
  ('T27','Runway Republic','Fashion & Lifestyle',5,10000000,5500000),
  ('T28','FarmFresh Formula','Food & Nutrition',4,10000000,5200000),
  ('T29','Muscle Metrics','Health & Fitness',5,10000000,4900000),
  ('T30','Vogue Venture','Fashion & Lifestyle',4,10000000,4600000);

insert into public.scores (team_id, activity_id, points, remarks)
select t.id, a.id, s.points, 'Seeded demo score'
from (values
  ('T01',1,92),('T01',2,88),('T01',3,90),
  ('T02',1,85),('T02',2,90),('T02',3,84),
  ('T03',1,88),('T03',2,82),('T03',3,86),
  ('T04',1,80),('T04',2,84),('T04',3,82),
  ('T05',1,83),('T05',2,79),('T05',3,80),
  ('T06',1,78),('T06',2,81),('T06',3,79),
  ('T07',1,76),('T07',2,77),('T07',3,78),
  ('T08',1,74),('T08',2,76),('T08',3,75),
  ('T09',1,72),('T09',2,74),('T09',3,73),
  ('T10',1,70),('T10',2,72),('T10',3,71),
  ('T11',1,68),('T11',2,70),('T11',3,69),
  ('T12',1,66),('T12',2,68),('T12',3,67),
  ('T13',1,64),('T13',2,66),('T13',3,65),
  ('T14',1,62),('T14',2,64),('T14',3,63),
  ('T15',1,60),('T15',2,62),('T15',3,61),
  ('T16',1,58),('T16',2,60),('T16',3,59),
  ('T17',1,56),('T17',2,58),('T17',3,57),
  ('T18',1,54),('T18',2,56),('T18',3,55),
  ('T19',1,52),('T19',2,54),('T19',3,53),
  ('T20',1,50),('T20',2,52),('T20',3,51),
  ('T21',1,48),('T21',2,50),('T21',3,49),
  ('T22',1,46),('T22',2,48),('T22',3,47),
  ('T23',1,44),('T23',2,46),('T23',3,45),
  ('T24',1,42),('T24',2,44),('T24',3,43),
  ('T25',1,40),('T25',2,42),('T25',3,41),
  ('T26',1,38),('T26',2,40),('T26',3,39),
  ('T27',1,36),('T27',2,38),('T27',3,37),
  ('T28',1,34),('T28',2,36),('T28',3,35),
  ('T29',1,32),('T29',2,34),('T29',3,33),
  ('T30',1,30),('T30',2,32),('T30',3,31)
) as s(team_code, act_order, points)
join public.teams t on t.team_code = s.team_code
join public.activities a on a.sort_order = s.act_order;