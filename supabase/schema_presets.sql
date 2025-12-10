-- Create enhancement_presets table
create table enhancement_presets (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  settings jsonb default '{}'::jsonb,
  user_id uuid references auth.users,
  is_global boolean default false
);

-- Enable RLS
alter table enhancement_presets enable row level security;

-- Policy: Users can view their own presets OR any global preset
create policy "Users can view own or global presets"
  on enhancement_presets for select
  using (
    (auth.uid() = user_id) OR
    (is_global = true)
  );

-- Policy: Users can insert their own presets
create policy "Users can create own presets"
  on enhancement_presets for insert
  with check (
    auth.uid() = user_id
  );

-- Policy: Users can update their own presets
create policy "Users can update own presets"
  on enhancement_presets for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id AND is_global = false );

-- Policy: Users can delete their own presets
create policy "Users can delete own presets"
  on enhancement_presets for delete
  using ( auth.uid() = user_id );

-- Policy: Admins can manage all presets
create policy "Admins can manage all presets"
  on enhancement_presets
  using ( auth.uid() in (select id from admins) )
  with check ( auth.uid() in (select id from admins) );
