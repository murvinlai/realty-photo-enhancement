-- Create enhancement_profiles table
create table enhancement_profiles (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  settings jsonb default '{}'::jsonb,
  user_id uuid references auth.users, -- can be null for system defaults if desired, or set to admin's ID
  is_global boolean default false
);

-- Enable RLS
alter table enhancement_profiles enable row level security;

-- Policy: Users can view their own profiles OR any global profile
create policy "Users can view own or global profiles"
  on enhancement_profiles for select
  using (
    (auth.uid() = user_id) OR
    (is_global = true)
  );

-- Policy: Users can insert their own profiles
create policy "Users can create own profiles"
  on enhancement_profiles for insert
  with check (
    auth.uid() = user_id
  );

-- Policy: Users can update their own profiles (but not global ones unless they are admin, handled below/implicitly)
-- Standard users should NOT be able to update global profiles or change the is_global flag.
create policy "Users can update own profiles"
  on enhancement_profiles for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id AND is_global = false ); -- Prevent user from making their profile global? Or just trust the API/UI?
  -- ideally we validate is_global on server side or ensure only admins can set it.

-- Policy: Users can delete their own profiles
create policy "Users can delete own profiles"
  on enhancement_profiles for delete
  using ( auth.uid() = user_id );

-- Policy: Admins can do ANYTHING (Select, Insert, Update, Delete)
-- We rely on the `admins` table we created earlier.
create policy "Admins can manage all profiles"
  on enhancement_profiles
  using ( auth.uid() in (select id from admins) )
  with check ( auth.uid() in (select id from admins) );
