// @vitest-environment node
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { makeClientAddressResolver } from './clientAddress.ts';

const request = (socket: string, forwarded?: string) => ({ socket: { remoteAddress: socket }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} }) as unknown as IncomingMessage;

describe('registration source address behind verified proxies', () => {
  it('ignores every forwarded header by default or when the socket is not trusted', () => {
    expect(makeClientAddressResolver([])(request('192.0.2.4', '198.51.100.1'))).toBe('192.0.2.4');
    expect(makeClientAddressResolver(['10.0.0.0/8'])(request('192.0.2.4', '198.51.100.1'))).toBe('192.0.2.4');
  });
  it('walks from the nearest trusted proxy and ignores a spoofed leftmost address', () => {
    const resolve = makeClientAddressResolver(['10.0.0.0/8', '2001:db8:1::/48']);
    expect(resolve(request('10.1.2.3', '203.0.113.10, 198.51.100.7, 10.9.8.7'))).toBe('198.51.100.7');
    expect(resolve(request('2001:db8:1::2', '2001:db8:2::3'))).toBe('2001:db8:2:0:0:0:0:3');
    expect(resolve(request('10.1.2.3', 'not-an-ip'))).toBe('10.1.2.3');
  });
  it('normalizes mapped IPv4 addresses and rejects invalid trust configuration', () => {
    expect(makeClientAddressResolver([])(request('::ffff:192.0.2.4'))).toBe('192.0.2.4');
    expect(() => makeClientAddressResolver(['*'])).toThrow(/IP addresses or CIDR/);
    expect(() => makeClientAddressResolver(['loopback'])).toThrow(/IP addresses or CIDR/);
    expect(() => makeClientAddressResolver(['10.0.0.0/99'])).toThrow(/IP addresses or CIDR/);
  });
});
