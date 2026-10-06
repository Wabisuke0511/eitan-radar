-- クリア条件の変更（2026-10-06）
-- 旧：全語を3回以上こたえる かつ 級全体の正答率90%以上
-- 新：全語を所定回数「正解」する（5・4・3級=1回、準2級・2級・準1級=2回） かつ 級全体の正答率90%以上
-- アプリ側（index.html の REQ）と同じ値にすること。既存の level_progress（クリア済み）はそのまま。
-- ※ public 全体を対象にする revoke / grant / drop は書かない（bpulse-check と共用のため）

create or replace function public.level_req(p_level text)
returns int language sql immutable set search_path = public as $$
  select case when p_level in ('5','4','3') then 1 else 2 end;
$$;

-- 署名・戻り値・security definer・権限は旧版と同じ（create or replace で既存の grant は保たれる）
create or replace function public.sync_level_progress(p_child uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  lv text; n int; ok int; att int; cor int; newly text[] := '{}';
begin
  if not public.owns_child(p_child) then raise exception 'forbidden'; end if;
  foreach lv in array array['5','4','3','p2','2','p1'] loop
    if exists (select 1 from public.level_progress where child_id = p_child and level = lv) then continue; end if;
    with v as (select id from public.vocab_items where level = lv and active),
    s as (
      select item_id, sum(seen) as seen, sum(correct) as correct
      from public.item_stats where child_id = p_child group by item_id
    )
    select count(*)::int,
           count(*) filter (where coalesce(s.correct, 0) >= public.level_req(lv))::int,
           coalesce(sum(s.seen), 0)::int,
           coalesce(sum(s.correct), 0)::int
      into n, ok, att, cor
    from v left join s on s.item_id = v.id;
    if n > 0 and ok = n and att > 0 and cor::numeric / att >= 0.9 then
      insert into public.level_progress (child_id, level) values (p_child, lv);
      newly := newly || lv;
    else
      exit;
    end if;
  end loop;
  return newly;
end $$;
