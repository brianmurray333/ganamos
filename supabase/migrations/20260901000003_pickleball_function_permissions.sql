DO $$ BEGIN
  REVOKE ALL ON FUNCTION join_pickleball_game_atomic(UUID, JSONB) FROM PUBLIC;
  REVOKE ALL ON FUNCTION set_pickleball_wager_consent(UUID, UUID, BOOLEAN) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION join_pickleball_game_atomic(UUID, JSONB) TO service_role;
  GRANT EXECUTE ON FUNCTION set_pickleball_wager_consent(UUID, UUID, BOOLEAN) TO service_role;
END $$;
