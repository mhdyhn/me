import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
};

/** The folder with the built app, or null when it has not been built (API-only mode). */
export function resolveStaticDir(path: string): string | null {
  const dir = resolve(path);
  return existsSync(join(dir, 'index.html')) ? dir : null;
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Respect an explicit gzip;q=0, even when a wildcard is also present. */
function acceptsGzip(value: string | undefined): boolean {
  if (!value) return false;
  let gzip: number | undefined;
  let wildcard: number | undefined;
  for (const item of value.toLowerCase().split(',')) {
    const [coding, ...parameters] = item.trim().split(';').map((part) => part.trim());
    if (coding !== 'gzip' && coding !== '*') continue;
    const quality = parameters.find((part) => part.startsWith('q='));
    const parsed = quality === undefined ? 1 : Number(quality.slice(2));
    const q = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
    if (coding === 'gzip') gzip = q;
    else wildcard = q;
  }
  return (gzip ?? wildcard ?? 0) > 0;
}

/** Serves a built file; gzip variants are public build assets, never API responses. */
export function serveStatic(root: string, pathname: string, response: ServerResponse, request?: IncomingMessage): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const candidate = normalize(join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) return false;
  let file = candidate;
  if (!isFile(file)) file = join(root, 'index.html');
  if (!isFile(file)) return false;
  const immutable = file.startsWith(join(root, 'assets') + sep);
  const compressed = acceptsGzip(request?.headers['accept-encoding']) && isFile(`${file}.gz`);
  const selected = compressed ? `${file}.gz` : file;
  const stat = statSync(selected);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}-${compressed ? 'gzip' : 'identity'}"`;
  const headers: Record<string, string> = {
    'ETag': etag,
    'Vary': 'Accept-Encoding',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Permissions-Policy': 'geolocation=(), microphone=(self), camera=(self)',
    ...(compressed ? { 'Content-Encoding': 'gzip' } : {}),
  };
  if (request?.headers['if-none-match'] === etag) {
    response.writeHead(304, headers);
    response.end();
    return true;
  }
  response.writeHead(200, {
    ...headers,
    'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Length': String(stat.size),
  });
  createReadStream(selected).pipe(response);
  return true;
}
