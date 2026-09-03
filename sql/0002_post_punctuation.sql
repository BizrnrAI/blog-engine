-- Apply after 0001 to the generation service's Supabase project.
-- Repairs existing prose without changing slugs, publication dates, or status.
begin;

create or replace function public.blog_normalize_prose(value text)
returns text language sql immutable strict set search_path = '' as $$
  select regexp_replace(value, '[ ' || chr(9) || ']*(' || chr(8212) || '|&mdash;|&#0*8212;|&#x0*2014;)[ ' || chr(9) || ']*', ' - ', 'gi');
$$;

create or replace function public.blog_normalize_json_prose(value jsonb)
returns jsonb language plpgsql immutable strict set search_path = '' as $$
declare result jsonb;
begin
  case jsonb_typeof(value)
    when 'string' then return to_jsonb(public.blog_normalize_prose(value #>> '{}'));
    when 'array' then
      select coalesce(jsonb_agg(public.blog_normalize_json_prose(item) order by ordinal), '[]'::jsonb)
        into result from jsonb_array_elements(value) with ordinality as entries(item, ordinal);
      return result;
    when 'object' then
      select coalesce(jsonb_object_agg(key, case when key = 'url' then item else public.blog_normalize_json_prose(item) end), '{}'::jsonb)
        into result from jsonb_each(value) as entries(key, item);
      return result;
    else return value;
  end case;
end;
$$;

create or replace function public.blog_enforce_punctuation()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.title := public.blog_normalize_prose(new.title);
  new.description := public.blog_normalize_prose(new.description);
  new.answer := public.blog_normalize_prose(new.answer);
  new.content := public.blog_normalize_prose(new.content);
  new.markdown := public.blog_normalize_prose(new.markdown);
  new.category := public.blog_normalize_prose(new.category);
  new.author := public.blog_normalize_prose(new.author);
  new.hero_image_alt := public.blog_normalize_prose(new.hero_image_alt);
  new.faqs := public.blog_normalize_json_prose(new.faqs);
  new.sources := public.blog_normalize_json_prose(new.sources);
  select coalesce(array_agg(public.blog_normalize_prose(tag) order by ordinal), '{}'::text[])
    into new.tags from unnest(new.tags) with ordinality as entries(tag, ordinal);
  return new;
end;
$$;

drop trigger if exists blog_posts_punctuation on public.blog_posts;
create trigger blog_posts_punctuation before insert or update on public.blog_posts
  for each row execute function public.blog_enforce_punctuation();

-- Trigger repairs only affected rows. Do not fake a freshness update for punctuation alone.
update public.blog_posts set content = content
where concat_ws(' ', title, description, answer, content, markdown, category, author,
                hero_image_alt, tags::text, faqs::text, sources::text)
  ~* (chr(8212) || '|&mdash;|&#0*8212;|&#x0*2014;');

-- Anonymous API reads must not expose future-scheduled posts.
drop policy if exists blog_posts_public_read on public.blog_posts;
create policy blog_posts_public_read on public.blog_posts for select
  using (status = 'published' and published_at <= current_date);

commit;
