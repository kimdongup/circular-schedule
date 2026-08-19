create table public.schedules (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  title text not null default '나의 하루 시간표',
  items jsonb not null default '[]'::jsonb,
  is_public boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.schedules enable row level security;

create policy "Public schedules are viewable by everyone" 
on public.schedules for select 
using (is_public = true or auth.uid() = user_id);

create policy "Anyone can insert schedules" 
on public.schedules for insert 
with check (true);

create policy "Users can update own schedules" 
on public.schedules for update 
using (auth.uid() = user_id);

create policy "Users can delete own schedules" 
on public.schedules for delete 
using (auth.uid() = user_id);