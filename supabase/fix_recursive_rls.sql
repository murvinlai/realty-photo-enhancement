-- 1. Create a secure function to check admin status without triggering RLS loops
-- security definer = runs with privileges of variable creator (super_admin), bypassing table RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.admins
    WHERE id = auth.uid()
  );
END;
$$;

-- 2. Drop the recursive policies on 'enhancement_presets'
DROP POLICY IF EXISTS "Admins can manage all presets" ON enhancement_presets;

-- 3. Re-create the policy using the safe function
CREATE POLICY "Admins can manage all presets"
  ON enhancement_presets
  USING ( is_admin() )
  WITH CHECK ( is_admin() );

-- 4. Do the same for 'enhancement_profiles' if it exists (preventing future errors)
DROP POLICY IF EXISTS "Admins can manage all profiles" ON enhancement_profiles;

CREATE POLICY "Admins can manage all profiles"
  ON enhancement_profiles
  USING ( is_admin() )
  WITH CHECK ( is_admin() );
