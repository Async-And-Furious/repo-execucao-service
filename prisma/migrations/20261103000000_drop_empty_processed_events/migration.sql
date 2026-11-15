BEGIN;

DO $$
BEGIN
  IF to_regclass('public.processed_events') IS NOT NULL THEN
    LOCK TABLE public.processed_events IN ACCESS EXCLUSIVE MODE;

    IF EXISTS (SELECT 1 FROM public.processed_events) THEN
      RAISE EXCEPTION 'Refusing to drop public.processed_events: table contains data';
    END IF;

    DROP TABLE public.processed_events RESTRICT;
  END IF;
END
$$;

COMMIT;
