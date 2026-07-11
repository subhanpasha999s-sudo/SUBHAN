-- Staff join hardening: only VERIFIED accounts can redeem an invite.
--
-- The app's login is OTP-first, but a password signup that never confirmed
-- its email could otherwise redeem an invite. Enforce at the source: the
-- joining user's email must be confirmed (email_confirmed_at set — true for
-- every OTP login and for confirmed password signups).

create or replace function public.accept_org_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_invite record;
  v_email text;
  v_confirmed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sign in first, then redeem the invite code';
  end if;
  select email, email_confirmed_at into v_email, v_confirmed
    from auth.users where id = auth.uid();
  if v_confirmed is null then
    raise exception 'verify your email first — sign in with the OTP code sent to your inbox, then retry';
  end if;
  select * into v_invite from public.org_invites
    where code = p_code and used_at is null and expires_at > now()
    for update;
  if v_invite.id is null then
    raise exception 'invalid, used, or expired invite code';
  end if;
  insert into public.organization_members (org_id, user_id, role, email)
    values (v_invite.org_id, auth.uid(), v_invite.role, v_email)
    on conflict (org_id, user_id) do update set role = excluded.role, email = excluded.email;
  update public.org_invites set used_by = auth.uid(), used_at = now() where id = v_invite.id;
  return v_invite.org_id;
end;
$$;
