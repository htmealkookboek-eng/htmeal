create table if not exists public.users (
    username text primary key,
    password text not null,
    session_token text,
    csrf_token text,
    created_at text,
    is_admin integer default 0,
    meta text
);

create table if not exists public.recipes (
    id text primary key,
    title text,
    description text,
    source text,
    owner text,
    image text,
    extra_image text,
    images text,
    extra_images text,
    tags text,
    ingredients text,
    instructions text,
    notes text,
    favorited_by text,
    servings integer,
    cooking_time text,
    created_at text,
    updated_at text,
    meta text
);

create table if not exists public.world_journey (
    id text primary key,
    owner text,
    data text,
    created_at text,
    updated_at text
);

create index if not exists recipes_owner_idx on public.recipes (owner);
create index if not exists recipes_title_idx on public.recipes (title);
create index if not exists recipes_tags_idx on public.recipes (tags);

alter table public.users enable row level security;
alter table public.recipes enable row level security;
alter table public.world_journey enable row level security;

revoke all on table public.users, public.recipes, public.world_journey from anon, authenticated;
grant all on table public.users, public.recipes, public.world_journey to service_role;