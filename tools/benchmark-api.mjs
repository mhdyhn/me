// Repeatable API benchmark against an isolated in-memory database and synthetic accounts.
// Delay represents one database round trip, not a measurement of the deployed service.
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { openDatabase } from '../server/db.ts';
import { createSession } from '../server/auth.ts';
import { insertUser } from '../server/users.ts';
import { saveProgramme } from '../server/programs.ts';
import { createApp } from '../server/app.ts';
import { keyFromSecret } from '../server/secrets.ts';

const delayMs = Number(process.env.BENCH_DB_DELAY_MS ?? 80);
const runs = Number(process.env.BENCH_RUNS ?? 3);
if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isInteger(runs) || runs < 1 || runs > 50) throw new Error('Invalid benchmark settings');
const db = await openDatabase('memory');
const now = new Date('2026-10-29T12:00:00Z');
let queryCount = 0;
const delayed = {
  async query(sql, params) {
    queryCount += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return db.query(sql, params);
  },
  exec: (sql) => db.exec(sql),
  close: () => db.close(),
};
let server;
try {
  const common = { passwordHash: 'not-a-real-password', mustChangePassword: false, now };
  const admin = await insertUser(db, { ...common, username: 'benchmark-admin', role: 'admin', displayName: 'مدیر آزمایشی', coachId: null });
  const coach = await insertUser(db, { ...common, username: 'benchmark-coach', role: 'coach', displayName: 'مربی آزمایشی', coachId: null });
  const student = await insertUser(db, { ...common, username: 'benchmark-student', role: 'student', displayName: 'شاگرد آزمایشی', coachId: coach });
  const independent = await insertUser(db, { ...common, username: 'benchmark-independent', role: 'student', displayName: 'فرد مستقل آزمایشی', coachId: null });
  const tokens = Object.fromEntries(await Promise.all(Object.entries({ admin, coach, student, independent }).map(async ([role, id]) => [role, await createSession(db, id, 0, now)])));
  await saveProgramme(db, student, coach, { title: 'برنامهٔ ساختگی', days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }], priceTomans: 100000 }, { mode: 'new', expectedId: null, expectedVersion: 0 }, now);
  server = createServer(createApp({ db: delayed, secretKey: keyFromSecret('a-non-production-benchmark-secret'), now: () => now }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cases = [
    ['student session', '/api/me', 'student'],
    ['coach session', '/api/me', 'coach'],
    ['admin session', '/api/me', 'admin'],
    ['independent session', '/api/me', 'independent'],
    ['student paid offer, locked', '/api/me/program', 'student'],
    ['independent programme', '/api/me/program', 'independent'],
    ['coach students', '/api/students', 'coach'],
    ['admin coaches', '/api/coaches', 'admin'],
  ];
  console.log(`Synthetic in-memory API; ${delayMs} ms per DB query; ${runs} runs. No production data.`);
  for (const [name, path, role] of cases) {
    const samples = [];
    let queries = 0;
    for (let i = 0; i < runs; i += 1) {
      queryCount = 0;
      const start = performance.now();
      const response = await fetch(base + path, { headers: { Authorization: `Bearer ${tokens[role]}` } });
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      samples.push(performance.now() - start);
      queries = queryCount;
    }
    samples.sort((a, b) => a - b);
    console.log(`${name.padEnd(27)} ${String(queries).padStart(2)} queries  median ${samples[Math.floor(samples.length / 2)].toFixed(0)} ms`);
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db.close();
}
