-- One-shot storage for the administrator recovery of attempt 0cc95870.
-- Applying this migration does not insert understanding rows.

create or replace function public.save_recovered_understanding(
  p_attempt_id uuid,
  p_scan_id uuid,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing integer;
  item jsonb;
  version integer;
  saved integer := 0;
  conversation uuid;
begin
  if p_attempt_id <> '0cc95870-6646-4ae1-a69c-4fc136789862'::uuid
     or p_scan_id <> '6dc2ba15-f367-4e35-a715-f18f5f507157'::uuid then
    raise exception 'recovery is limited to the stored understanding attempt';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) <> 10 then
    raise exception 'recovery expects the ten stored readings';
  end if;

  perform pg_advisory_xact_lock(861358, 495870);

  select count(*) into existing
  from public.opportunities
  where scan_id = p_scan_id
    and understanding->>'recoveredFromAttempt' = p_attempt_id::text;
  if existing > 0 then
    return jsonb_build_object(
      'idempotent', true,
      'saved', existing,
      'x_requests', 0,
      'model_calls', 0,
      'research_calls', 0,
      'posted', false
    );
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    conversation := (item->>'conversation_id')::uuid;
    if not exists (
      select 1 from public.x_posts
      where scan_id = p_scan_id and conversation_id = conversation
    ) then
      raise exception 'a reading is not one of the stored conversations';
    end if;

    select coalesce(max(editorial_assessments.version), 0) + 1 into version
    from public.editorial_assessments
    where conversation_id = conversation
      and scan_id = p_scan_id;

    insert into public.editorial_assessments (
      conversation_id, scan_id, version, worth_talking_about, opportunity_type, priority,
      research_need, timeliness, possible_angle, reason, pass_reason, claim_extraction_needed,
      content_score, queue_rank, lifecycle, next_stage, discovered_at, source, model_called, x_requests
    ) values (
      conversation,
      p_scan_id,
      version,
      (item->'assessment'->>'worth_talking_about')::boolean,
      nullif(item->'assessment'->>'opportunity_type', ''),
      nullif(item->'assessment'->>'priority', ''),
      nullif(item->'assessment'->>'research_need', ''),
      item->'assessment'->>'timeliness',
      coalesce(item->'assessment'->>'possible_angle', ''),
      item->'assessment'->>'reason',
      nullif(item->'assessment'->>'pass_reason', ''),
      coalesce((item->'assessment'->>'claim_extraction_needed')::boolean, false),
      nullif(item->'assessment'->>'content_score', '')::numeric,
      nullif(item->'assessment'->>'queue_rank', '')::integer,
      item->'assessment'->>'lifecycle',
      nullif(item->'assessment'->>'next_stage', ''),
      coalesce(nullif(item->'assessment'->>'discovered_at', '')::timestamptz, now()),
      'model',
      false,
      0
    );

    insert into public.opportunities (
      conversation_id, claim_id, scan_id, content_pillar, opportunity_type, research_required,
      score, score_reason, what_happened, why_interesting, what_could_add, angles,
      research_questions, voice, status, source, origin, lifecycle, queue_rank, timeliness,
      priority, claim_extraction_needed, pass_reason, content_score, assessment_version,
      discovered_at, possible_angle, understanding
    ) values (
      conversation,
      null,
      p_scan_id,
      item->'opportunity'->>'content_pillar',
      item->'opportunity'->>'opportunity_type',
      item->'opportunity'->>'research_required',
      item->'opportunity'->>'score',
      item->'opportunity'->>'score_reason',
      item->'opportunity'->>'what_happened',
      item->'opportunity'->>'why_interesting',
      item->'opportunity'->>'what_could_add',
      coalesce(item->'opportunity'->'angles', '[]'::jsonb),
      coalesce(
        array(select jsonb_array_elements_text(item->'opportunity'->'research_questions')),
        '{}'::text[]
      ),
      item->'opportunity'->>'voice',
      item->'opportunity'->>'status',
      'assessment',
      'live',
      item->'opportunity'->>'lifecycle',
      nullif(item->'opportunity'->>'queue_rank', '')::integer,
      nullif(item->'opportunity'->>'timeliness', ''),
      nullif(item->'opportunity'->>'priority', ''),
      coalesce((item->'opportunity'->>'claim_extraction_needed')::boolean, false),
      nullif(item->'opportunity'->>'pass_reason', ''),
      nullif(item->'opportunity'->>'content_score', '')::numeric,
      version,
      coalesce(nullif(item->'opportunity'->>'discovered_at', '')::timestamptz, now()),
      coalesce(item->'opportunity'->>'possible_angle', ''),
      item->'opportunity'->'understanding'
    );
    saved := saved + 1;
  end loop;

  return jsonb_build_object(
    'idempotent', false,
    'saved', saved,
    'x_requests', 0,
    'model_calls', 0,
    'research_calls', 0,
    'posted', false
  );
end;
$$;

revoke all on function public.save_recovered_understanding(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_recovered_understanding(uuid, uuid, jsonb) to service_role;
