import { getPool, queryDB } from '../setup-db';
import { seedUser, seedDevice, seedGameScore } from './helpers/test-isolation';

// TODO: These tests assume multiple devices per user, but the database now has 
// a unique constraint on devices.user_id (one device per user).
// These tests need to be redesigned to work with the current schema.
describe.skip('Leaderboard Integration Tests', () => {
  let testUserId: string;
  let testDeviceIds: string[] = [];

  beforeAll(async () => {
    // Create test user
    const user = await seedUser({
      email: 'leaderboard-test@example.com',
      name: 'Leaderboard Tester',
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    // Cleanup test devices and scores
    if (testDeviceIds.length > 0) {
      await queryDB(
        'DELETE FROM flappy_bird_game WHERE device_id = ANY($1::uuid[])',
        [testDeviceIds]
      );
      await queryDB(
        'DELETE FROM devices WHERE id = ANY($1::uuid[])',
        [testDeviceIds]
      );
    }
    testDeviceIds = [];
  });

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      await queryDB('DELETE FROM profiles WHERE id = $1', [testUserId]);
    }

    const pool = getPool();
    await pool.end();
  });

  describe('Database Query Validation', () => {
    it('should fetch top 20 scores ordered by score DESC, created_at ASC', async () => {
      // Seed 25 test scores
      const scores = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 95, 85, 75, 65, 55];

      for (let i = 0; i < scores.length; i++) {
        const device = await seedDevice(testUserId, {
          petName: `Pet ${i + 1}`,
        });
        testDeviceIds.push(device.id);

        await seedGameScore(device.id, testUserId, scores[i]);
      }

      // Query top 20 with proper ordering
      const result = await queryDB(`
        SELECT 
          fbg.score,
          fbg.created_at,
          d.pet_name
        FROM flappy_bird_game fbg
        JOIN devices d ON fbg.device_id = d.id
        WHERE fbg.device_id = ANY($1::uuid[])
        ORDER BY fbg.score DESC, fbg.created_at ASC
        LIMIT 20
      `, [testDeviceIds]);

      expect(result.rows).toHaveLength(20);

      // Verify descending score order
      for (let i = 0; i < result.rows.length - 1; i++) {
        const currentScore = result.rows[i].score;
        const nextScore = result.rows[i + 1].score;
        expect(currentScore).toBeGreaterThanOrEqual(nextScore);

        // If scores are equal, verify created_at ascending
        if (currentScore === nextScore) {
          const currentTime = new Date(result.rows[i].created_at).getTime();
          const nextTime = new Date(result.rows[i + 1].created_at).getTime();
          expect(currentTime).toBeLessThanOrEqual(nextTime);
        }
      }

      // Verify top score
      expect(result.rows[0].score).toBe(100);
    });

    it('should handle tiebreaking with created_at timestamp', async () => {
      // Create 3 devices with same score but different timestamps
      const baseTime = Date.now();
      const deviceIds = [];

      for (let i = 0; i < 3; i++) {
        const device = await seedDevice(testUserId, {
          petName: `Tied Player ${i + 1}`,
        });
        testDeviceIds.push(device.id);
        deviceIds.push(device.id);

        // Insert score with specific timestamp
        await queryDB(
          `INSERT INTO flappy_bird_game (device_id, user_id, score, created_at)
           VALUES ($1, $2, $3, $4)`,
          [device.id, testUserId, 50, new Date(baseTime + i * 1000).toISOString()]
        );
      }

      // Query tied scores
      const result = await queryDB(`
        SELECT 
          fbg.device_id,
          fbg.score,
          fbg.created_at,
          d.pet_name
        FROM flappy_bird_game fbg
        JOIN devices d ON fbg.device_id = d.id
        WHERE fbg.device_id = ANY($1::uuid[])
        ORDER BY fbg.score DESC, fbg.created_at ASC
      `, [deviceIds]);

      expect(result.rows).toHaveLength(3);
      
      // All scores should be 50
      expect(result.rows[0].score).toBe(50);
      expect(result.rows[1].score).toBe(50);
      expect(result.rows[2].score).toBe(50);

      // Verify chronological order (earliest first)
      const time1 = new Date(result.rows[0].created_at).getTime();
      const time2 = new Date(result.rows[1].created_at).getTime();
      const time3 = new Date(result.rows[2].created_at).getTime();

      expect(time1).toBeLessThan(time2);
      expect(time2).toBeLessThan(time3);
    });

    it('should join with devices table and return pet_name', async () => {
      const petNames = ['Satoshi', 'Luna', 'Bolt'];
      const deviceIds = [];

      for (const petName of petNames) {
        const device = await seedDevice(testUserId, {
          petName,
        });
        testDeviceIds.push(device.id);
        deviceIds.push(device.id);
        await seedGameScore(device.id, testUserId, 100 - petNames.indexOf(petName) * 10);
      }

      const result = await queryDB(`
        SELECT 
          fbg.score,
          d.pet_name
        FROM flappy_bird_game fbg
        JOIN devices d ON fbg.device_id = d.id
        WHERE fbg.device_id = ANY($1::uuid[])
        ORDER BY fbg.score DESC
      `, [deviceIds]);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].pet_name).toBe('Satoshi');
      expect(result.rows[0].score).toBe(100);
      expect(result.rows[1].pet_name).toBe('Luna');
      expect(result.rows[1].score).toBe(90);
      expect(result.rows[2].pet_name).toBe('Bolt');
      expect(result.rows[2].score).toBe(80);
    });

    it('should handle empty leaderboard gracefully', async () => {
      const result = await queryDB(`
        SELECT 
          fbg.score,
          fbg.created_at,
          d.pet_name
        FROM flappy_bird_game fbg
        JOIN devices d ON fbg.device_id = d.id
        WHERE fbg.device_id = $1
        ORDER BY fbg.score DESC, fbg.created_at ASC
        LIMIT 20
      `, ['00000000-0000-0000-0000-000000000000']); // Non-existent device

      expect(result.rows).toHaveLength(0);
    });

    it('should respect LIMIT 20 constraint', async () => {
      // Seed 30 scores
      for (let i = 0; i < 30; i++) {
        const device = await seedDevice(testUserId, {
          petName: `Pet ${i + 1}`,
        });
        testDeviceIds.push(device.id);
        await seedGameScore(device.id, testUserId, 100 - i);
      }

      const result = await queryDB(`
        SELECT COUNT(*) as count
        FROM (
          SELECT fbg.score
          FROM flappy_bird_game fbg
          WHERE fbg.device_id = ANY($1::uuid[])
          ORDER BY fbg.score DESC, fbg.created_at ASC
          LIMIT 20
        ) subquery
      `, [testDeviceIds]);

      expect(parseInt(result.rows[0].count)).toBe(20);
    });

    it('should handle null pet_name gracefully', async () => {
      const device = await seedDevice(testUserId, {
        petName: undefined, // No pet name set - will use default
      });
      testDeviceIds.push(device.id);
      await seedGameScore(device.id, testUserId, 75);

      const result = await queryDB(`
        SELECT 
          fbg.score,
          d.pet_name
        FROM flappy_bird_game fbg
        JOIN devices d ON fbg.device_id = d.id
        WHERE fbg.device_id = $1
      `, [device.id]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].score).toBe(75);
      // pet_name will be default 'TestPet' from seedDevice
      expect(result.rows[0].pet_name).toBeDefined();
    });
  });

  describe('API Endpoint Integration', () => {
    it('should return valid leaderboard data through API', async () => {
      // Seed test data
      const scores = [100, 90, 80, 70, 60];
      for (let i = 0; i < scores.length; i++) {
        const device = await seedDevice(testUserId, {
          petName: `Player ${i + 1}`,
        });
        testDeviceIds.push(device.id);
        await seedGameScore(device.id, testUserId, scores[i]);
      }

      // Call API endpoint
      const response = await fetch('http://localhost:3000/api/leaderboard');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.leaderboard.length).toBeGreaterThan(0);
      expect(data.totalEntries).toBeGreaterThan(0);

      // Verify data structure
      const firstEntry = data.leaderboard[0];
      expect(firstEntry).toHaveProperty('rank');
      expect(firstEntry).toHaveProperty('petName');
      expect(firstEntry).toHaveProperty('score');
      expect(firstEntry).toHaveProperty('createdAt');
    });
  });
});
