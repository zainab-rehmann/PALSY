-- PALSY migration 013 — chat locker (2026-11-14).
-- One optional locker code per user. The user chooses which DMs and
-- rooms to lock; nothing is locked by default. The code itself is
-- NEVER stored or sent in plain form: only a bcrypt hash lives in
-- locker_codes, a table with NO RLS policies, so no client role can
-- read or write it directly. All access goes through the SECURITY
-- DEFINER functions below, which return only true/false or nothing.
-- locked_chats holds one row per locked chat, readable/writable only
-- by its owner (own-row policies). The lock hides chats in the app
-- lists and gates the chat pages; it does not change message storage.
-- Removing the code (including the forgot-code reset) also clears all
-- of that user's locked rows, so locked chats become visible again.
-- Idempotent: safe to run more than once.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.locker_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code_hash  text not null,
  updated_at timestamptz not null default now()
);
alter table public.locker_codes enable row level security;
-- Deliberately NO policies on locker_codes: clients can neither read
-- the hashes nor write them. SECURITY DEFINER functions bypass RLS
-- and are the only way in.

create table if not exists public.locked_chats (
  user_id    uuid not null references auth.users(id) on delete cascade,
  chat_type  text not null check (chat_type in ('dm', 'room')),
  target_id  uuid not null,
  locked_at  timestamptz not null default now(),
  primary key (user_id, chat_type, target_id)
);
alter table public.locked_chats enable row level security;

drop policy if exists locked_chats_own_select on public.locked_chats;
create policy locked_chats_own_select on public.locked_chats
  for select to authenticated using (user_id = auth.uid());
drop policy if exists locked_chats_own_insert on public.locked_chats;
create policy locked_chats_own_insert on public.locked_chats
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists locked_chats_own_delete on public.locked_chats;
create policy locked_chats_own_delete on public.locked_chats
  for delete to authenticated using (user_id = auth.uid());

-- Does the caller have a locker code set? Boolean only.
create or replace function public.has_locker_code()
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists(select 1 from public.locker_codes where user_id = auth.uid());
$$;

-- Set (or change) the caller's locker code. Codes are 4-8
-- letters/digits, stored uppercase, bcrypt-hashed with a fresh salt.
create or replace function public.set_locker_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  v_code := upper(btrim(p_code));
  if length(v_code) < 4 or length(v_code) > 8 or v_code !~ '^[A-Z0-9]+$' then
    raise exception 'code must be 4-8 letters or digits';
  end if;
  insert into public.locker_codes (user_id, code_hash)
  values (auth.uid(), extensions.crypt(v_code, extensions.gen_salt('bf')))
  on conflict (user_id) do update set code_hash = excluded.code_hash, updated_at = now();
end;
$$;

-- Verify the caller's locker code. Returns only a boolean — the code
-- and the hash never leave the database. False when no code is set.
create or replace function public.verify_locker_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_hash text;
begin
  select code_hash into v_hash from public.locker_codes where user_id = auth.uid();
  if v_hash is null then return false; end if;
  if p_code is null or btrim(p_code) = '' then return false; end if;
  return v_hash = extensions.crypt(upper(btrim(p_code)), v_hash);
end;
$$;

-- Remove the caller's locker code AND unlock all of their locked
-- chats, so nothing stays locked with no way back in. Used by the
-- Settings "remove code" action and the forgot-code reset.
create or replace function public.remove_locker_code()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.locker_codes where user_id = auth.uid();
  delete from public.locked_chats where user_id = auth.uid();
end;
$$;

-- Is this chat locked for a given user? Used by notification writers
-- (the sender) so previews stay hidden for locked chats. The caller
-- can only ask about chats they take part in: for a DM, the target
-- must be the caller themself; for a room, the caller must be a
-- member. Returns only a boolean.
create or replace function public.is_chat_locked_for(p_user_id uuid, p_chat_type text, p_target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then return false; end if;
  if p_chat_type = 'dm' then
    if p_target_id <> auth.uid() then return false; end if;
  elsif p_chat_type = 'room' then
    if not exists (select 1 from public.room_members where room_id = p_target_id and user_id = auth.uid()) then
      return false;
    end if;
  else
    return false;
  end if;
  return exists (
    select 1 from public.locked_chats
    where user_id = p_user_id and chat_type = p_chat_type and target_id = p_target_id
  );
end;
$$;

-- Only signed-in users may call these functions (not anonymous).
revoke execute on function public.has_locker_code() from public;
revoke execute on function public.set_locker_code(text) from public;
revoke execute on function public.verify_locker_code(text) from public;
revoke execute on function public.remove_locker_code() from public;
revoke execute on function public.is_chat_locked_for(uuid, text, uuid) from public;
grant execute on function public.has_locker_code() to authenticated;
grant execute on function public.set_locker_code(text) to authenticated;
grant execute on function public.verify_locker_code(text) to authenticated;
grant execute on function public.remove_locker_code() to authenticated;
grant execute on function public.is_chat_locked_for(uuid, text, uuid) to authenticated;
