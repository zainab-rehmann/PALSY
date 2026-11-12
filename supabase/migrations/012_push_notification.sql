-- PALSY migration 012: deduped notification writes (push_notification RPC)
-- Applied: 2026-11-12 (via Supabase SQL Editor)
-- Why: the app's notification helpers run as the SENDER, but the
-- notifications_delete_own policy only allows deleting your OWN rows, so the
-- old client-side delete-then-insert dedupe silently deleted nothing and
-- duplicate unread rows piled up. This function does the replace atomically.
-- Safety: it only deletes UNREAD rows that the CALLER created
-- (data.sender_id = auth.uid()) with the same recipient, type and dedupe key.
-- Read rows are never touched, and no other user's rows can be removed.
create or replace function public.push_notification(
  p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_id uuid;
begin
  v_key := p_data ->> 'dedupe_key';
  if v_key is not null then
    delete from public.notifications
     where user_id = p_user_id
       and type = p_type
       and is_read = false
       and data ->> 'dedupe_key' = v_key
       and data ->> 'sender_id' = auth.uid()::text;
  end if;
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, p_data)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.push_notification(uuid, text, text, text, jsonb) from public;
grant execute on function public.push_notification(uuid, text, text, text, jsonb) to authenticated;
