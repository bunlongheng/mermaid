alter table diagrams add column if not exists tags text[] default '{}';
create index if not exists diagrams_tags_idx on diagrams using gin(tags);
