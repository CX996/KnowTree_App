alter table public.profiles
  add column email_verification_status text not null default 'pending'
    check (email_verification_status in ('pending', 'verified'));

update public.profiles profile
set email_verification_status = case
  when auth_user.email_confirmed_at is not null then 'verified'
  else 'pending'
end
from auth.users auth_user
where auth_user.id = profile.user_id;

revoke update (email_verification_status)
  on table public.profiles from authenticated;
