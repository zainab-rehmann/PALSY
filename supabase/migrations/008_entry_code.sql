-- PALSY migration 008 — optional room entry codes (2026-11-12).
-- Owners can set an OPTIONAL entry code per room. The code itself is
-- NEVER stored or sent in plain form: only a bcrypt hash lives in
-- room_entry_codes, a table with NO RLS policies, so no client role can
-- read or write it directly. All access goes through the SECURITY
-- DEFINER functions below, which return only true/false or nothing.
-- rooms.has_entry_code is a plain On/Off flag (safe for anyone to read;
-- it drives the lock indicator). The invite_code flow is untouched.
-- Idempotent: safe to run more than once.
create extension if not exists pgcrypto with schema extensions;

alter table public.rooms
  add column if not exists has_entry_code boolean not null default false;

create table if not exists public.room_entry_codes (
  room_id    uuid primary key references public.rooms(id) on delete cascade,
  code_hash  text not null,
  updated_at timestamptz not null default now()
);
alter table public.room_entry_codes enable row level security;
-- Deliberately NO policies on room_entry_codes: clients can neither
-- read the hashes nor write them. SECURITY DEFINER functions bypass
-- RLS and are the only way in.

-- Verify a code. Returns true when the room has no code (open entry),
-- or when the entered code matches the stored bcrypt hash. Returns only
-- a boolean — the code and the hash never leave the database.
create or replace function public.verify_room_entry_code(p_room_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_hash text;
begin
  select code_hash into v_hash from public.room_entry_codes where room_id = p_room_id;
  if v_hash is null then return true; end if;
  if p_code is null or btrim(p_code) = '' then return false; end if;
  return v_hash = extensions.crypt(upper(btrim(p_code)), v_hash);
end;
$$;

-- Set (or change) a room's entry code. Owner only. Codes are 4-8
-- letters/digits, stored uppercase, bcrypt-hashed with a fresh salt.
create or replace function public.set_room_entry_code(p_room_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_owner uuid;
declare v_code text;
begin
  select owner_id into v_owner from public.rooms where id = p_room_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'only the room owner can set an entry code';
  end if;
  v_code := upper(btrim(p_code));
  if length(v_code) < 4 or length(v_code) > 8 or v_code !~ '^[A-Z0-9]+$' then
    raise exception 'code must be 4-8 letters or digits';
  end if;
  insert into public.room_entry_codes (room_id, code_hash)
  values (p_room_id, extensions.crypt(v_code, extensions.gen_salt('bf')))
  on conflict (room_id) do update set code_hash = excluded.code_hash, updated_at = now();
  update public.rooms set has_entry_code = true where id = p_room_id;
end;
$$;

-- Remove a room's entry code (back to open entry). Owner only.
create or replace function public.remove_room_entry_code(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.rooms where id = p_room_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'only the room owner can remove an entry code';
  end if;
  delete from public.room_entry_codes where room_id = p_room_id;
  update public.rooms set has_entry_code = false where id = p_room_id;
end;
$$;

-- Only signed-in users may call these functions (not anonymous).
revoke execute on function public.verify_room_entry_code(uuid, text) from public;
revoke execute on function public.set_room_entry_code(uuid, text) from public;
revoke execute on function public.remove_room_entry_code(uuid) from public;
grant execute on function public.verify_room_entry_code(uuid, text) to authenticated;
grant execute on function public.set_room_entry_code(uuid, text) to authenticated;
grant execute on function public.remove_room_entry_code(uuid) to authenticated;
