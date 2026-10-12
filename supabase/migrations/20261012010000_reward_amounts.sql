-- 賞金額の変更（2026-10-12）：1〜3段目は各1,000円、4段目からは500円ずつ上がる（4段目1,500円・5段目2,000円・6段目2,500円、合計9,000円）
-- アプリ側（index.html の prize）と同じ式にすること。旧：rank × 1,000円
alter table public.reward_payments drop constraint reward_payments_amount_check;
update public.reward_payments set amount = case when rank <= 3 then 1000 else 1000 + (rank - 3) * 500 end;
alter table public.reward_payments add constraint reward_payments_amount_check
  check (amount = case when rank <= 3 then 1000 else 1000 + (rank - 3) * 500 end);
