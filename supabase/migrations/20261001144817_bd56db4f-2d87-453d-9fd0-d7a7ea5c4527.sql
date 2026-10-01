CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select exists (select 1 from auth.users where id = _user_id and email_confirmed_at is not null)
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;