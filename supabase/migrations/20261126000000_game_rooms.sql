-- =============================================================================
-- Game rooms: multiplayer Pickleball, Flappy Pet and Sat Catcher with bets.
--
-- One flow for all three games: a host opens a room with a bet, friends (family
-- or a shared Ganamos group) join, each player's bet is HELD in the room's pot
-- when they join, the host starts, and the pot is paid out by the server:
--   * Pickleball (live, played over ESP-NOW): every device reports the result;
--     the pot pays only when all reports agree.
--   * Flappy Pet / Sat Catcher (turns): players take turns on the same course
--     (shared seed); the highest score wins; ties split.
-- A game that doesn't finish (expired room, host leaves, devices disagree, a
-- live game never reports) returns every bet.
--
-- Money rules:
--   * Every step that moves sats is ONE function call, so a crash can't leave
--     sats in two places or nowhere. Held sats are debited from the player's
--     balance (and pet_coins, as atomic_transfer does) with a completed
--     'internal' ledger row; payouts and refunds credit with another.
--   * Bets can't spend sats reserved by pending withdrawals.
--   * Only service_role (the API) may call these functions.
--
-- Devices authenticate game calls with a per-device secret (devices.game_secret_hash),
-- not the device id alone: device ids used to be shared with other players.
--
-- Replaces the never-deployed pickleball_games wager code: its functions are
-- dropped here if present.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Device secret
-- ---------------------------------------------------------------------------
ALTER TABLE devices ADD COLUMN IF NOT EXISTS game_secret_hash TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS game_secret_issued_at TIMESTAMPTZ;
COMMENT ON COLUMN devices.game_secret_hash IS
  'sha256 hex of the per-device secret that authenticates game/bet API calls. Issued once per pairing; never returned after issue.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL CHECK (game_type IN ('pickleball', 'flappy', 'satcatcher')),
  host_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'playing', 'finished', 'void')),
  bet_sats INTEGER NOT NULL CHECK (bet_sats IN (0, 10, 50, 100, 500)),
  max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 6),
  seed INTEGER,                       -- shared course seed (turn games), set at start
  match_generation INTEGER NOT NULL DEFAULT 0,
  current_seat INTEGER,               -- turn games: whose turn
  turn_deadline TIMESTAMPTZ,          -- turn games: start-by / finish-by
  play_deadline TIMESTAMPTZ,          -- pickleball: must finish by
  first_report_at TIMESTAMPTZ,        -- pickleball: first result report
  expires_at TIMESTAMPTZ NOT NULL,    -- open rooms close (and refund) after this
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_rooms_open ON game_rooms(status, expires_at) WHERE status IN ('open', 'playing');
CREATE INDEX IF NOT EXISTS idx_game_rooms_host_user ON game_rooms(host_user_id);

CREATE TABLE IF NOT EXISTS game_room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  pet_name TEXT NOT NULL,
  mac_address TEXT,
  seat INTEGER NOT NULL,              -- join order: 0 = host
  status TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'left')),
  active BOOLEAN NOT NULL DEFAULT true,  -- in a room that hasn't ended
  stake_sats INTEGER NOT NULL DEFAULT 0 CHECK (stake_sats >= 0),
  stake_tx_id UUID,
  refund_tx_id UUID,
  payout_sats INTEGER NOT NULL DEFAULT 0,
  payout_tx_id UUID,
  score INTEGER,
  turn_started_at TIMESTAMPTZ,
  turn_finished_at TIMESTAMPTZ,
  report JSONB,                       -- pickleball: {winner, left, right}
  reported_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, device_id),
  UNIQUE (room_id, seat)
);

-- A device is in at most one live room at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_game_room_players_active_device
  ON game_room_players(device_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_game_room_players_user ON game_room_players(user_id);

ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_room_players ENABLE ROW LEVEL SECURITY;
-- No browser policies: devices and the app go through the API (service role).
REVOKE ALL ON game_rooms, game_room_players FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Drop the never-deployed pickleball wager functions (if a database has them)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS join_pickleball_game_atomic(UUID, JSONB);
DROP FUNCTION IF EXISTS set_pickleball_wager_consent(UUID, UUID, BOOLEAN);

-- ---------------------------------------------------------------------------
-- Money helpers (internal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _game_room_debit(p_user UUID, p_amount INTEGER, p_memo TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance INTEGER;
  v_pending BIGINT;
  v_tx UUID := gen_random_uuid();
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  SELECT balance INTO v_balance FROM profiles WHERE id = p_user FOR UPDATE;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_pending FROM transactions
   WHERE user_id = p_user AND type = 'withdrawal' AND status IN ('pending', 'pending_approval');
  IF v_balance - v_pending < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;
  UPDATE profiles
     SET balance = balance - p_amount,
         pet_coins = COALESCE(pet_coins, 0) - p_amount,
         updated_at = now()
   WHERE id = p_user;
  INSERT INTO transactions (id, user_id, type, amount, status, memo, created_at, updated_at)
  VALUES (v_tx, p_user, 'internal', -p_amount, 'completed', p_memo, now(), now());
  RETURN v_tx;
END; $$;

CREATE OR REPLACE FUNCTION _game_room_credit(p_user UUID, p_amount INTEGER, p_memo TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx UUID := gen_random_uuid();
  v_rows INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  UPDATE profiles
     SET balance = balance + p_amount,
         pet_coins = COALESCE(pet_coins, 0) + p_amount,
         updated_at = now()
   WHERE id = p_user;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  INSERT INTO transactions (id, user_id, type, amount, status, memo, created_at, updated_at)
  VALUES (v_tx, p_user, 'internal', p_amount, 'completed', p_memo, now(), now());
  RETURN v_tx;
END; $$;

CREATE OR REPLACE FUNCTION _game_label(p_game TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_game WHEN 'pickleball' THEN 'Pickleball' WHEN 'flappy' THEN 'Flappy Pet' ELSE 'Sat Catcher' END
$$;

-- ---------------------------------------------------------------------------
-- Who may see / join whose rooms: the same person, family (parent/child links,
-- siblings under one parent) or members of a shared Ganamos group.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION game_room_can_see(p_viewer UUID, p_host UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_viewer = p_host
    OR EXISTS (
      SELECT 1 FROM connected_accounts
       WHERE (primary_user_id = p_viewer AND connected_user_id = p_host)
          OR (primary_user_id = p_host AND connected_user_id = p_viewer))
    OR EXISTS (
      SELECT 1 FROM connected_accounts a JOIN connected_accounts b ON a.primary_user_id = b.primary_user_id
       WHERE a.connected_user_id = p_viewer AND b.connected_user_id = p_host)
    OR EXISTS (
      SELECT 1 FROM group_members a JOIN group_members b ON a.group_id = b.group_id
       WHERE a.user_id = p_viewer AND b.user_id = p_host
         AND a.status = 'approved' AND b.status = 'approved')
$$;

-- ---------------------------------------------------------------------------
-- End a room: void (refund everyone) or settle (pay the pot)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _game_room_void(p_room UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  p RECORD;
  v_tx UUID;
BEGIN
  SELECT * INTO r FROM game_rooms WHERE id = p_room FOR UPDATE;
  IF r.status NOT IN ('open', 'playing') THEN
    RETURN;
  END IF;
  FOR p IN SELECT * FROM game_room_players WHERE room_id = p_room AND status = 'joined' ORDER BY seat LOOP
    IF p.stake_sats > 0 AND p.refund_tx_id IS NULL THEN
      v_tx := _game_room_credit(p.user_id, p.stake_sats, 'Bet returned: ' || _game_label(r.game_type));
      UPDATE game_room_players SET refund_tx_id = v_tx WHERE id = p.id;
    END IF;
  END LOOP;
  UPDATE game_room_players SET active = false WHERE room_id = p_room;
  UPDATE game_rooms
     SET status = 'void', void_reason = p_reason, ended_at = now(), updated_at = now(),
         current_seat = NULL, turn_deadline = NULL
   WHERE id = p_room;
END; $$;

CREATE OR REPLACE FUNCTION _game_room_settle(p_room UUID, p_winner_seats INTEGER[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  v_pot INTEGER;
  v_n INTEGER;
  v_share INTEGER;
  v_extra INTEGER;
  v_amount INTEGER;
  v_first BOOLEAN := true;
  p RECORD;
  v_tx UUID;
BEGIN
  SELECT * INTO r FROM game_rooms WHERE id = p_room FOR UPDATE;
  IF r.status <> 'playing' THEN
    RETURN;
  END IF;
  v_n := COALESCE(array_length(p_winner_seats, 1), 0);
  IF v_n = 0 THEN
    PERFORM _game_room_void(p_room, 'no_winner');
    RETURN;
  END IF;
  SELECT COALESCE(SUM(stake_sats), 0) INTO v_pot FROM game_room_players
   WHERE room_id = p_room AND status = 'joined';
  v_share := v_pot / v_n;
  v_extra := v_pot - v_share * v_n;
  -- Winners in the order given (first = earliest to post the winning score);
  -- the first gets any leftover sat from an uneven split.
  FOR p IN
    SELECT gp.*, array_position(p_winner_seats, gp.seat) AS ord
      FROM game_room_players gp
     WHERE gp.room_id = p_room AND gp.status = 'joined' AND gp.seat = ANY (p_winner_seats)
     ORDER BY array_position(p_winner_seats, gp.seat)
  LOOP
    v_amount := v_share + CASE WHEN v_first THEN v_extra ELSE 0 END;
    v_first := false;
    IF v_amount > 0 THEN
      v_tx := _game_room_credit(p.user_id, v_amount, 'Won ' || _game_label(r.game_type));
      UPDATE game_room_players SET payout_sats = v_amount, payout_tx_id = v_tx WHERE id = p.id;
    END IF;
  END LOOP;
  UPDATE game_room_players SET active = false WHERE room_id = p_room;
  UPDATE game_rooms
     SET status = 'finished', ended_at = now(), updated_at = now(), current_seat = NULL, turn_deadline = NULL
   WHERE id = p_room;
END; $$;

-- Turn games: winners = top score; order by who posted it first.
CREATE OR REPLACE FUNCTION _game_room_settle_turns(p_room UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_top INTEGER;
  v_seats INTEGER[];
BEGIN
  SELECT MAX(score) INTO v_top FROM game_room_players WHERE room_id = p_room AND status = 'joined';
  SELECT array_agg(seat ORDER BY turn_finished_at NULLS LAST, seat) INTO v_seats
    FROM game_room_players WHERE room_id = p_room AND status = 'joined' AND score = v_top;
  PERFORM _game_room_settle(p_room, v_seats);
END; $$;

-- Turn games: move to the next player who hasn't played, or settle.
CREATE OR REPLACE FUNCTION _game_room_next_turn(p_room UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT MIN(seat) INTO v_next FROM game_room_players
   WHERE room_id = p_room AND status = 'joined' AND score IS NULL;
  IF v_next IS NULL THEN
    PERFORM _game_room_settle_turns(p_room);
  ELSE
    UPDATE game_rooms
       SET current_seat = v_next, turn_deadline = now() + interval '90 seconds', updated_at = now()
     WHERE id = p_room;
  END IF;
END; $$;

-- Apply timeouts to one room (called on every read and by the sweep cron).
CREATE OR REPLACE FUNCTION _game_room_tick(p_room UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  v_guard INTEGER := 0;
BEGIN
  LOOP
    SELECT * INTO r FROM game_rooms WHERE id = p_room FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 8;
    IF r.status = 'open' AND r.expires_at <= now() THEN
      PERFORM _game_room_void(p_room, 'expired');
      RETURN;
    ELSIF r.status = 'playing' AND r.game_type = 'pickleball' THEN
      IF r.play_deadline <= now()
         OR (r.first_report_at IS NOT NULL AND r.first_report_at + interval '2 minutes' <= now()) THEN
        PERFORM _game_room_void(p_room, 'unfinished');
      END IF;
      RETURN;
    ELSIF r.status = 'playing' AND r.turn_deadline IS NOT NULL AND r.turn_deadline <= now() THEN
      -- Missed turn (never started in time, or never finished): it counts as 0.
      UPDATE game_room_players
         SET score = 0, turn_finished_at = now()
       WHERE room_id = p_room AND seat = r.current_seat AND score IS NULL;
      PERFORM _game_room_next_turn(p_room);
      -- loop: the next turn's deadline is in the future, so this ends next pass
    ELSE
      RETURN;
    END IF;
  END LOOP;
END; $$;

-- ---------------------------------------------------------------------------
-- State shown to a device. Never includes other players' device or user ids.
-- MAC addresses only for Pickleball (needed for the radio link), only to members.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _game_room_view(p_room UUID, p_device UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  v_me game_room_players%ROWTYPE;
  v_is_member BOOLEAN;
  v_players JSONB;
  v_pot INTEGER;
BEGIN
  SELECT * INTO r FROM game_rooms WHERE id = p_room;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_me FROM game_room_players WHERE room_id = p_room AND device_id = p_device;
  v_is_member := FOUND AND v_me.status = 'joined';
  SELECT COALESCE(SUM(stake_sats), 0) INTO v_pot FROM game_room_players
   WHERE room_id = p_room AND status = 'joined';
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'seat', gp.seat,
            'petName', gp.pet_name,
            'isYou', gp.device_id = p_device,
            'isHost', gp.device_id = r.host_device_id,
            'played', gp.score IS NOT NULL,
            'score', gp.score,
            'payout', gp.payout_sats,
            'mac', CASE WHEN r.game_type = 'pickleball' AND v_is_member THEN gp.mac_address END
          ) ORDER BY gp.seat), '[]'::jsonb)
    INTO v_players
    FROM game_room_players gp WHERE gp.room_id = p_room AND gp.status = 'joined';
  RETURN jsonb_build_object(
    'roomId', r.id,
    'game', r.game_type,
    'status', r.status,
    'bet', r.bet_sats,
    'pot', v_pot,
    'maxPlayers', r.max_players,
    'players', v_players,
    'youAreIn', v_is_member,
    'youAreHost', r.host_device_id = p_device,
    'yourSeat', CASE WHEN v_is_member THEN v_me.seat END,
    'yourPayout', CASE WHEN v_is_member THEN v_me.payout_sats END,
    'yourStakeReturned', CASE WHEN v_is_member THEN v_me.refund_tx_id IS NOT NULL END,
    'currentSeat', r.current_seat,
    'yourTurn', v_is_member AND r.status = 'playing' AND r.current_seat = v_me.seat,
    'turnStarted', v_is_member AND v_me.turn_started_at IS NOT NULL AND v_me.score IS NULL,
    'secondsLeft', CASE
       WHEN r.status = 'open' THEN GREATEST(0, EXTRACT(EPOCH FROM (r.expires_at - now()))::INTEGER)
       WHEN r.turn_deadline IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (r.turn_deadline - now()))::INTEGER)
       WHEN r.play_deadline IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (r.play_deadline - now()))::INTEGER)
     END,
    'seed', CASE WHEN v_is_member AND r.status <> 'open' THEN r.seed END,
    'matchGeneration', r.match_generation,
    'voidReason', r.void_reason
  );
END; $$;

-- ---------------------------------------------------------------------------
-- Public (service_role) entry points. Each takes the authenticated device id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION game_room_create(p_device UUID, p_game TEXT, p_bet INTEGER, p_mac TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d devices%ROWTYPE;
  v_room UUID := gen_random_uuid();
  v_tx UUID;
  v_old RECORD;
BEGIN
  SELECT * INTO d FROM devices WHERE id = p_device;
  IF NOT FOUND THEN RAISE EXCEPTION 'device_not_found'; END IF;
  IF p_game NOT IN ('pickleball', 'flappy', 'satcatcher') THEN RAISE EXCEPTION 'invalid_game'; END IF;
  IF p_bet IS NULL OR p_bet NOT IN (0, 10, 50, 100, 500) THEN RAISE EXCEPTION 'invalid_bet'; END IF;

  -- A device that left a room behind (crash, power off) gets out of it first.
  FOR v_old IN SELECT room_id FROM game_room_players WHERE device_id = p_device AND active LOOP
    PERFORM _game_room_tick(v_old.room_id);
  END LOOP;
  IF EXISTS (SELECT 1 FROM game_room_players WHERE device_id = p_device AND active) THEN
    RAISE EXCEPTION 'already_in_room';
  END IF;

  INSERT INTO game_rooms (id, game_type, host_device_id, host_user_id, bet_sats, max_players, expires_at)
  VALUES (v_room, p_game, p_device, d.user_id, p_bet,
          CASE WHEN p_game = 'pickleball' THEN 4 ELSE 6 END,
          now() + interval '5 minutes');
  IF p_bet > 0 THEN
    v_tx := _game_room_debit(d.user_id, p_bet, 'Bet held: ' || _game_label(p_game));
  END IF;
  INSERT INTO game_room_players (room_id, device_id, user_id, pet_name, mac_address, seat, stake_sats, stake_tx_id)
  VALUES (v_room, p_device, d.user_id, d.pet_name, p_mac, 0, p_bet, v_tx);
  RETURN _game_room_view(v_room, p_device);
END; $$;

CREATE OR REPLACE FUNCTION game_room_list(p_device UUID, p_game TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d devices%ROWTYPE;
  v_balance BIGINT;
  v_out JSONB;
  v_room RECORD;
BEGIN
  SELECT * INTO d FROM devices WHERE id = p_device;
  IF NOT FOUND THEN RAISE EXCEPTION 'device_not_found'; END IF;
  -- Close out expired rooms first so they never show.
  FOR v_room IN SELECT id FROM game_rooms WHERE status = 'open' AND expires_at <= now() LIMIT 50 LOOP
    PERFORM _game_room_tick(v_room.id);
  END LOOP;
  SELECT p.balance - COALESCE((SELECT SUM(amount) FROM transactions t
           WHERE t.user_id = p.id AND t.type = 'withdrawal' AND t.status IN ('pending', 'pending_approval')), 0)
    INTO v_balance FROM profiles p WHERE p.id = d.user_id;
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'createdAt') DESC), '[]'::jsonb) INTO v_out FROM (
    SELECT jsonb_build_object(
             'roomId', r.id,
             'game', r.game_type,
             'bet', r.bet_sats,
             'hostPetName', (SELECT pet_name FROM game_room_players WHERE room_id = r.id AND seat = 0),
             'players', (SELECT COUNT(*) FROM game_room_players WHERE room_id = r.id AND status = 'joined'),
             'maxPlayers', r.max_players,
             'canAfford', r.bet_sats <= COALESCE(v_balance, 0),
             'secondsLeft', GREATEST(0, EXTRACT(EPOCH FROM (r.expires_at - now()))::INTEGER),
             'createdAt', r.created_at
           ) AS x
      FROM game_rooms r
     WHERE r.status = 'open'
       AND r.expires_at > now()
       AND (p_game IS NULL OR r.game_type = p_game)
       AND r.host_device_id <> p_device
       AND (SELECT COUNT(*) FROM game_room_players WHERE room_id = r.id AND status = 'joined') < r.max_players
       AND game_room_can_see(d.user_id, r.host_user_id)
     ORDER BY r.created_at DESC
     LIMIT 10
  ) s;
  RETURN jsonb_build_object('rooms', v_out, 'balance', COALESCE(v_balance, 0));
END; $$;

CREATE OR REPLACE FUNCTION game_room_join(p_room UUID, p_device UUID, p_mac TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d devices%ROWTYPE;
  r game_rooms%ROWTYPE;
  v_count INTEGER;
  v_seat INTEGER;
  v_tx UUID;
  v_old RECORD;
BEGIN
  SELECT * INTO d FROM devices WHERE id = p_device;
  IF NOT FOUND THEN RAISE EXCEPTION 'device_not_found'; END IF;
  PERFORM _game_room_tick(p_room);
  SELECT * INTO r FROM game_rooms WHERE id = p_room FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM game_room_players WHERE room_id = p_room AND device_id = p_device AND status = 'joined') THEN
    RETURN _game_room_view(p_room, p_device);  -- already in (retry)
  END IF;
  IF r.status <> 'open' OR r.expires_at <= now() THEN RAISE EXCEPTION 'room_closed'; END IF;
  IF NOT game_room_can_see(d.user_id, r.host_user_id) THEN RAISE EXCEPTION 'room_not_found'; END IF;

  FOR v_old IN SELECT room_id FROM game_room_players WHERE device_id = p_device AND active LOOP
    PERFORM _game_room_tick(v_old.room_id);
  END LOOP;
  IF EXISTS (SELECT 1 FROM game_room_players WHERE device_id = p_device AND active) THEN
    RAISE EXCEPTION 'already_in_room';
  END IF;

  SELECT COUNT(*) INTO v_count FROM game_room_players WHERE room_id = p_room;
  IF v_count >= r.max_players THEN
    RAISE EXCEPTION 'room_full';
  END IF;
  -- Lowest free seat (a player who leaves frees theirs). Pickleball sides follow seats.
  SELECT MIN(s) INTO v_seat FROM generate_series(0, r.max_players - 1) s
   WHERE NOT EXISTS (SELECT 1 FROM game_room_players WHERE room_id = p_room AND seat = s);
  IF r.bet_sats > 0 THEN
    v_tx := _game_room_debit(d.user_id, r.bet_sats, 'Bet held: ' || _game_label(r.game_type));
  END IF;
  INSERT INTO game_room_players (room_id, device_id, user_id, pet_name, mac_address, seat, stake_sats, stake_tx_id)
  VALUES (p_room, p_device, d.user_id, d.pet_name, p_mac, v_seat, r.bet_sats, v_tx);
  UPDATE game_rooms SET updated_at = now() WHERE id = p_room;
  RETURN _game_room_view(p_room, p_device);
END; $$;

CREATE OR REPLACE FUNCTION game_room_leave(p_room UUID, p_device UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  p game_room_players%ROWTYPE;
  v_tx UUID;
BEGIN
  PERFORM _game_room_tick(p_room);
  SELECT * INTO r FROM game_rooms WHERE id = p_room FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  SELECT * INTO p FROM game_room_players WHERE room_id = p_room AND device_id = p_device FOR UPDATE;
  IF NOT FOUND OR p.status <> 'joined' THEN RAISE EXCEPTION 'not_in_room'; END IF;
  IF r.status <> 'open' THEN
    -- Can't leave a game in progress with your bet; ended rooms: nothing to do
    IF r.status = 'playing' THEN RAISE EXCEPTION 'game_in_progress'; END IF;
    RETURN _game_room_view(p_room, p_device);
  END IF;
  IF r.host_device_id = p_device THEN
    PERFORM _game_room_void(p_room, 'host_left');
  ELSE
    IF p.stake_sats > 0 AND p.refund_tx_id IS NULL THEN
      v_tx := _game_room_credit(p.user_id, p.stake_sats, 'Bet returned: ' || _game_label(r.game_type));
    END IF;
    -- The ledger rows keep the record; the seat is freed for someone else.
    DELETE FROM game_room_players WHERE id = p.id;
    UPDATE game_rooms SET updated_at = now() WHERE id = p_room;
    RETURN jsonb_build_object('roomId', p_room, 'left', true, 'returned', p.stake_sats);
  END IF;
  RETURN _game_room_view(p_room, p_device);
END; $$;

CREATE OR REPLACE FUNCTION game_room_start(p_room UUID, p_device UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  v_n INTEGER;
BEGIN
  PERFORM _game_room_tick(p_room);
  SELECT * INTO r FROM game_rooms WHERE id = p_room FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF r.host_device_id <> p_device THEN RAISE EXCEPTION 'not_host'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'room_closed'; END IF;
  SELECT COUNT(*) INTO v_n FROM game_room_players WHERE room_id = p_room AND status = 'joined';
  IF v_n < 2 THEN RAISE EXCEPTION 'need_two_players'; END IF;
  UPDATE game_rooms
     SET status = 'playing',
         started_at = now(),
         seed = floor(random() * 2147483646)::INTEGER + 1,
         match_generation = match_generation + 1,
         play_deadline = CASE WHEN game_type = 'pickleball' THEN now() + interval '15 minutes' END,
         updated_at = now()
   WHERE id = p_room;
  IF r.game_type <> 'pickleball' THEN
    PERFORM _game_room_next_turn(p_room);
  END IF;
  RETURN _game_room_view(p_room, p_device);
END; $$;

CREATE OR REPLACE FUNCTION game_room_turn_begin(p_room UUID, p_device UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  p game_room_players%ROWTYPE;
BEGIN
  PERFORM _game_room_tick(p_room);
  SELECT * INTO r FROM game_rooms WHERE id = p_room FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  SELECT * INTO p FROM game_room_players WHERE room_id = p_room AND device_id = p_device AND status = 'joined';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_in_room'; END IF;
  IF r.status <> 'playing' OR r.game_type = 'pickleball' OR r.current_seat IS DISTINCT FROM p.seat THEN
    RAISE EXCEPTION 'not_your_turn';
  END IF;
  IF p.turn_started_at IS NULL THEN
    UPDATE game_room_players SET turn_started_at = now() WHERE id = p.id;
    -- A run can't take more than 10 minutes
    UPDATE game_rooms SET turn_deadline = now() + interval '10 minutes', updated_at = now() WHERE id = p_room;
  END IF;
  RETURN _game_room_view(p_room, p_device);
END; $$;

-- Highest plausible score for a run of p_seconds (server-measured).
CREATE OR REPLACE FUNCTION game_room_score_cap(p_game TEXT, p_seconds NUMERIC)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_game
    WHEN 'flappy' THEN floor(p_seconds * 1.5)::INTEGER + 3
    WHEN 'satcatcher' THEN floor(p_seconds * 3)::INTEGER + 3
    ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION game_room_turn_submit(p_room UUID, p_device UUID, p_score INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  p game_room_players%ROWTYPE;
  v_seconds NUMERIC;
BEGIN
  SELECT * INTO r FROM game_rooms WHERE id = p_room FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  SELECT * INTO p FROM game_room_players WHERE room_id = p_room AND device_id = p_device AND status = 'joined' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_in_room'; END IF;
  IF r.status <> 'playing' OR r.game_type = 'pickleball' OR r.current_seat IS DISTINCT FROM p.seat THEN
    RAISE EXCEPTION 'not_your_turn';
  END IF;
  IF p.turn_started_at IS NULL THEN RAISE EXCEPTION 'turn_not_started'; END IF;
  IF p.score IS NOT NULL THEN RETURN _game_room_view(p_room, p_device); END IF;
  IF p_score IS NULL OR p_score < 0 THEN RAISE EXCEPTION 'invalid_score'; END IF;
  -- Past the deadline the turn already counts as 0 (the tick applies it)
  IF r.turn_deadline <= now() THEN
    -- Not an exception: that would roll back the timeout the tick applies.
    PERFORM _game_room_tick(p_room);
    RETURN _game_room_view(p_room, p_device) || jsonb_build_object('error', 'turn_expired');
  END IF;
  v_seconds := EXTRACT(EPOCH FROM (now() - p.turn_started_at));
  IF p_score > game_room_score_cap(r.game_type, v_seconds) THEN
    RAISE EXCEPTION 'implausible_score';
  END IF;
  UPDATE game_room_players SET score = p_score, turn_finished_at = now() WHERE id = p.id;
  PERFORM _game_room_next_turn(p_room);
  RETURN _game_room_view(p_room, p_device);
END; $$;

-- Pickleball: each device reports the result it saw. Pays only when all agree.
CREATE OR REPLACE FUNCTION game_room_report(p_room UUID, p_device UUID, p_winner TEXT, p_left INTEGER, p_right INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  p game_room_players%ROWTYPE;
  v_report JSONB;
  v_total INTEGER;
  v_reported INTEGER;
  v_distinct INTEGER;
  v_seats INTEGER[];
BEGIN
  PERFORM _game_room_tick(p_room);
  SELECT * INTO r FROM game_rooms WHERE id = p_room FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  SELECT * INTO p FROM game_room_players WHERE room_id = p_room AND device_id = p_device AND status = 'joined' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_in_room'; END IF;
  IF r.game_type <> 'pickleball' THEN RAISE EXCEPTION 'invalid_game'; END IF;
  IF r.status <> 'playing' THEN RETURN _game_room_view(p_room, p_device); END IF;
  IF p_winner NOT IN ('left', 'right') OR p_left IS NULL OR p_right IS NULL
     OR p_left < 0 OR p_right < 0 OR p_left > 50 OR p_right > 50
     OR (p_winner = 'left' AND p_left <= p_right) OR (p_winner = 'right' AND p_right <= p_left) THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  IF p.report IS NOT NULL THEN RETURN _game_room_view(p_room, p_device); END IF;  -- first report stands

  v_report := jsonb_build_object('winner', p_winner, 'left', p_left, 'right', p_right);
  UPDATE game_room_players SET report = v_report, reported_at = now() WHERE id = p.id;
  UPDATE game_rooms SET first_report_at = COALESCE(first_report_at, now()), updated_at = now() WHERE id = p_room;

  SELECT COUNT(*), COUNT(report), COUNT(DISTINCT report) INTO v_total, v_reported, v_distinct
    FROM game_room_players WHERE room_id = p_room AND status = 'joined';
  IF v_distinct > 1 THEN
    PERFORM _game_room_void(p_room, 'results_disagree');
  ELSIF v_reported = v_total THEN
    -- Sides by seat: 0 left, 1 right, 2 right, 3 left
    SELECT array_agg(seat ORDER BY seat) INTO v_seats FROM game_room_players
     WHERE room_id = p_room AND status = 'joined'
       AND (CASE WHEN seat IN (0, 3) THEN 'left' ELSE 'right' END) = p_winner;
    PERFORM _game_room_settle(p_room, v_seats);
  END IF;
  RETURN _game_room_view(p_room, p_device);
END; $$;

CREATE OR REPLACE FUNCTION game_room_state(p_room UUID, p_device UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r game_rooms%ROWTYPE;
  d devices%ROWTYPE;
BEGIN
  PERFORM _game_room_tick(p_room);
  SELECT * INTO r FROM game_rooms WHERE id = p_room;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  -- Members (current or past) always; others only while it's open and visible to them
  IF NOT EXISTS (SELECT 1 FROM game_room_players WHERE room_id = p_room AND device_id = p_device) THEN
    SELECT * INTO d FROM devices WHERE id = p_device;
    IF r.status <> 'open' OR NOT game_room_can_see(d.user_id, r.host_user_id) THEN
      RAISE EXCEPTION 'room_not_found';
    END IF;
  END IF;
  RETURN _game_room_view(p_room, p_device);
END; $$;

-- The device's live room, if any (to resume after a reboot).
CREATE OR REPLACE FUNCTION game_room_current(p_device UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room UUID;
BEGIN
  SELECT room_id INTO v_room FROM game_room_players WHERE device_id = p_device AND active LIMIT 1;
  IF v_room IS NULL THEN RETURN NULL; END IF;
  PERFORM _game_room_tick(v_room);
  RETURN _game_room_view(v_room, p_device);
END; $$;

-- Cron: apply timeouts to every live room.
CREATE OR REPLACE FUNCTION game_rooms_sweep()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room RECORD;
  v_n INTEGER := 0;
BEGIN
  FOR v_room IN SELECT id FROM game_rooms WHERE status IN ('open', 'playing') LOOP
    PERFORM _game_room_tick(v_room.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END; $$;

-- Sats currently held in pots (the daily summary counts them as owed to users).
CREATE OR REPLACE FUNCTION game_rooms_held_sats()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(gp.stake_sats), 0)
    FROM game_room_players gp JOIN game_rooms r ON r.id = gp.room_id
   WHERE r.status IN ('open', 'playing') AND gp.status = 'joined' AND gp.refund_tx_id IS NULL
$$;

-- ---------------------------------------------------------------------------
-- Permissions: service_role only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    '_game_room_debit(uuid, integer, text)',
    '_game_room_credit(uuid, integer, text)',
    'game_room_can_see(uuid, uuid)',
    '_game_room_void(uuid, text)',
    '_game_room_settle(uuid, integer[])',
    '_game_room_settle_turns(uuid)',
    '_game_room_next_turn(uuid)',
    '_game_room_tick(uuid)',
    '_game_room_view(uuid, uuid)',
    'game_room_create(uuid, text, integer, text)',
    'game_room_list(uuid, text)',
    'game_room_join(uuid, uuid, text)',
    'game_room_leave(uuid, uuid)',
    'game_room_start(uuid, uuid)',
    'game_room_turn_begin(uuid, uuid)',
    'game_room_turn_submit(uuid, uuid, integer)',
    'game_room_report(uuid, uuid, text, integer, integer)',
    'game_room_state(uuid, uuid)',
    'game_room_current(uuid)',
    'game_rooms_sweep()',
    'game_rooms_held_sats()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
