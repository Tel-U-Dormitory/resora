-- Deferred checks allow a provisioner to create the actor and SR assignment
-- in one transaction, while preventing incomplete identities at commit.
-- Drizzle Kit does not represent these cross-table triggers in its snapshot.
CREATE FUNCTION public.check_sr_identity_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected_ids text[];
  checked_id text;
  current_actor public.actor_type;
  has_sr_profile boolean;
  nim text;
BEGIN
  IF TG_TABLE_NAME = 'user' THEN
    affected_ids := ARRAY[OLD.id, NEW.id];
  ELSIF TG_OP = 'INSERT' THEN
    affected_ids := ARRAY[NEW.user_id];
  ELSIF TG_OP = 'DELETE' THEN
    affected_ids := ARRAY[OLD.user_id];
  ELSE
    affected_ids := ARRAY[OLD.user_id, NEW.user_id];
  END IF;

  FOR checked_id IN
    SELECT DISTINCT value FROM unnest(affected_ids) AS ids(value)
    WHERE value IS NOT NULL ORDER BY value
  LOOP
    -- Serialize checks against the same identity, including concurrent edits.
    SELECT actor INTO current_actor FROM public.user_profiles
    WHERE user_id = checked_id FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.sr_profiles WHERE user_id = checked_id
    ) INTO has_sr_profile;

    IF (current_actor = 'SR') <> has_sr_profile THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'sr_profile_actor_consistency',
        MESSAGE = 'SR actors require exactly one SR profile; other actors require none';
    END IF;

    IF current_actor = 'SR' THEN
      SELECT username INTO nim FROM public."user"
      WHERE id = checked_id FOR UPDATE;
      IF nim IS NULL OR length(btrim(nim)) = 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          CONSTRAINT = 'sr_profile_nim_required',
          MESSAGE = 'SR identities require a nonblank Better Auth username';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER user_profiles_sr_consistency
AFTER INSERT OR UPDATE OR DELETE ON public.user_profiles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_sr_identity_consistency();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sr_profiles_actor_consistency
AFTER INSERT OR UPDATE OR DELETE ON public.sr_profiles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_sr_identity_consistency();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER user_sr_nim_consistency
AFTER UPDATE OF username ON public."user"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_sr_identity_consistency();
