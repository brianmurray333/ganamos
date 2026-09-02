CREATE OR REPLACE FUNCTION join_pickleball_game_atomic(p_game_id UUID, p_player JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g pickleball_games%ROWTYPE; current_players JSONB; slot INTEGER; assignment JSONB;
BEGIN
  SELECT * INTO g FROM pickleball_games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'game_not_found'; END IF;
  IF g.status <> 'lobby' OR g.lobby_expires_at <= now() THEN RAISE EXCEPTION 'game_not_accepting_players'; END IF;
  current_players := COALESCE(g.players, '[]'::jsonb);
  SELECT ordinality - 1 INTO slot FROM jsonb_array_elements(current_players) WITH ORDINALITY AS e(player, ordinality)
    WHERE player->>'deviceId' = p_player->>'deviceId';
  IF slot IS NOT NULL THEN RETURN jsonb_build_object('players', current_players, 'playerIndex', slot, 'alreadyJoined', true); END IF;
  slot := jsonb_array_length(current_players);
  IF slot >= 4 THEN RAISE EXCEPTION 'game_full'; END IF;
  assignment := (jsonb_build_array(jsonb_build_object('side','left','position','top'), jsonb_build_object('side','right','position','top'), jsonb_build_object('side','right','position','bottom'), jsonb_build_object('side','left','position','bottom')))->slot;
  current_players := current_players || jsonb_build_array(p_player || assignment || jsonb_build_object('playerIndex', slot, 'wagerAccepted', false));
  UPDATE pickleball_games SET players = current_players, updated_at = now() WHERE id = p_game_id;
  RETURN jsonb_build_object('players', current_players, 'playerIndex', slot, 'alreadyJoined', false);
END; $$;
