-- Run this in Supabase Dashboard → SQL Editor (https://supabase.com/dashboard/project/dqyqlgnaawqnlxvxwcys/sql)
-- Creates chat_sessions and chat_messages tables for conversational follow-up on diagnostics.

create table if not exists public.chat_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  diagnostic_log_id bigint references public.diagnostic_logs(id) on delete set null,
  prompt_summary text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy chat_sessions_owner
  on public.chat_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy chat_messages_session_owner
  on public.chat_messages for all
  using (
    session_id in (select id from public.chat_sessions where user_id = auth.uid())
  )
  with check (
    session_id in (select id from public.chat_sessions where user_id = auth.uid())
  );

create index if not exists chat_sessions_user_idx
  on public.chat_sessions(user_id, created_at desc);
create index if not exists chat_messages_session_idx
  on public.chat_messages(session_id, created_at asc);
