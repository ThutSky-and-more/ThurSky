create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id text not null,
  customer_email text not null,
  package_name text not null,
  status text not null default 'received' check (status in ('received','planning','confirmed','captured','editing','ready','completed','cancelled')),
  desired_date date,
  street text,
  postal_code text,
  city text,
  customer_message text,
  admin_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

create table if not exists public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists order_files_order_id_idx on public.order_files(order_id);

alter table public.orders enable row level security;
alter table public.order_files enable row level security;

insert into storage.buckets (id,name,public)
values ('customer-files','customer-files',false)
on conflict (id) do update set public=false;
