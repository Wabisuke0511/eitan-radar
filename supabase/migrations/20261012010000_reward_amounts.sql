-- 賞金額の変更（2026-10-12）：1〜3段目は各1,000円、4段目からは500円ずつ上がる（4段目1,500円・5段目2,000円・6段目2,500円、合計9,000円）
-- アプリ側（index.html の prize）と同じ式にすること。旧：rank × 1,000円
-- 旧チェックは2列（amount・rank）を参照するため、自動で付いた名前が環境によって違う。名前を決め打ちせず、amount を含むチェックを探して外す。
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.reward_payments'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%amount%'
  loop
    execute format('alter table public.reward_payments drop constraint %I', c);
  end loop;
end $$;

update public.reward_payments set amount = case when rank <= 3 then 1000 else 1000 + (rank - 3) * 500 end;

alter table public.reward_payments add constraint reward_payments_amount_check
  check (amount = case when rank <= 3 then 1000 else 1000 + (rank - 3) * 500 end);
