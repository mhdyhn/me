import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const url = 'https://raw.githubusercontent.com/tomqwu/ai_health/78a03f1bc6b9e832b75c97e66b3f185623c96a81/public/models/human.glb';
const expectedSha256 = 'b04500155d110fed366f5ce8c13231797f1796c8146311401f17e16dd11cfede';
const target = 'public/models/human.glb';

const response = await fetch(url);
if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const hash = createHash('sha256').update(bytes).digest('hex');
if (hash !== expectedSha256) throw new Error(`Model checksum mismatch: ${hash}`);
await mkdir('public/models', { recursive: true });
await writeFile(target, bytes);
console.log(`Saved verified model to ${target}`);
