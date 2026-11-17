-- 024_reactions_replica_identity.sql
-- Live reaction REMOVAL needs the full old row: message_reactions has a
-- surrogate id primary key, so with the default replica identity a
-- DELETE event only carries that id — the live handler never learns
-- which message lost its reaction. REPLICA IDENTITY FULL makes DELETE
-- (and UPDATE) events carry every column, including message_id.
-- Re-runnable: setting it twice is a no-op.
alter table public.message_reactions replica identity full;
