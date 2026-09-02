CREATE OR REPLACE FUNCTION set_pickleball_wager_consent(p_game_id UUID, p_device_id UUID, p_accepted BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g pickleball_games%ROWTYPE; updated_players JSONB;
BEGIN
  SELECT * INTO g FROM pickleball_games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR g.status <> 'lobby' THEN RAISE EXCEPTION 'game_not_in_lobby'; END IF;
  IF p_accepted THEN
    SELECT COALESCE(jsonb_agg(CASE WHEN player->>'deviceId' = p_device_id::text THEN jsonb_set(player, '{wagerAccepted}', 'true'::jsonb) ELSE player END ORDER BY ordinality), '[]'::jsonb)
      INTO updated_players FROM jsonb_array_elements(g.players) WITH ORDINALITY AS e(player, ordinality);
  ELSE
    SELECT COALESCE(jsonb_agg((player - 'side' - 'position' - 'playerIndex') || ((jsonb_build_array(jsonb_build_object('side','left','position','top'), jsonb_build_object('side','right','position','top'), jsonb_build_object('side','right','position','bottom'), jsonb_build_object('side','left','position','bottom')))->(new_ordinality - 1)) || jsonb_build_object('playerIndex', new_ordinality - 1) ORDER BY new_ordinality), '[]'::jsonb)
      INTO updated_players FROM (SELECT player, row_number() OVER (ORDER BY ordinality) AS new_ordinality FROM jsonb_array_elements(g.players) WITH ORDINALITY AS e(player, ordinality) WHERE player->>'deviceId' <> p_device_id::text) remaining;
  END IF;
  UPDATE pickleball_games SET players = updated_players, updated_at = now() WHERE id = p_game_id;
  RETURN jsonb_build_object('players', updated_players, 'accepted', p_accepted);
END; $$;
