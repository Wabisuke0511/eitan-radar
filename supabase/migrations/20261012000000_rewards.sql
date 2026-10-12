-- ランクの賞金の受け渡し記録（2026-10-12）
-- ランク n（1〜6）＝ 下から n 個の級をクリア（5級→4級→3級→準2級→2級→準1級）。賞金は n × 1,000円。
-- 保護者がアプリで PIN を確認してから記録する。達成していないランクは DB 側でも記録できない。
-- ※ bpulse-check と共用のため、権限の変更はこのテーブルだけにする（public 全体は触らない）

create table public.reward_payments (
  child_id uuid not null references public.children(id) on delete cascade,
  rank smallint not null check (rank between 1 and 6),
  amount int not null check (amount = rank * 1000),
  paid_at timestamptz not null default now(),
  primary key (child_id, rank)
);

alter table public.reward_payments enable row level security;

create policy reward_payments_select on public.reward_payments
  for select to authenticated using (public.owns_child(child_id));

create policy reward_payments_insert on public.reward_payments
  for insert to authenticated with check (
    public.owns_child(child_id)
    and (select count(*) from public.level_progress lp where lp.child_id = reward_payments.child_id) >= rank
  );

create policy reward_payments_delete on public.reward_payments
  for delete to authenticated using (public.owns_child(child_id));

-- クライアントは「記録」と「取り消し」だけ（update はさせない）
revoke all on table public.reward_payments from anon;
revoke update on table public.reward_payments from authenticated;
