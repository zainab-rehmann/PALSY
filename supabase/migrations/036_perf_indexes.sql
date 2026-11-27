-- 036_perf_indexes.sql — performance: index the two hot filtered reads
-- that had no index (found in the Sat 28 Nov performance pass).
-- games(room_id, created_at): the room live-game banner + poll query.
-- notifications(user_id, created_at): the bell list + unread counts.
create index if not exists games_room_idx on public.games (room_id, created_at desc);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
