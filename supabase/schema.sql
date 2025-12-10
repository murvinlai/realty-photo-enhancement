-- Create a table for admin users
create table admins (
  id uuid references auth.users not null primary key,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table admins enable row level security;

-- Policies for admins table
create policy "Admins can view all admins"
  on admins for select
  using ( auth.uid() in (select id from admins) );

-- Allow users to read their own admin status (critical for isData loading)
create policy "Users can view own admin status"
  on admins for select
  using ( auth.uid() = id );

-- Policies for profiles (assuming 'profiles' table exists for users, if not we might need to create it or adjust)
-- If you don't have a 'profiles' table yet, skip this part or adjust to your user table name.
-- Assuming standard usage where public.profiles mirrors auth.users often:

-- create policy "Admins can view all profiles"
--   on profiles for select
--   using ( auth.uid() in (select id from admins) );

-- create policy "Admins can update all profiles"
--   on profiles for update
--   using ( auth.uid() in (select id from admins) );
