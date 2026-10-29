import type { IncomingMessage } from 'node:http';
import ipaddr from 'ipaddr.js';
import proxyaddr from 'proxy-addr';

/** Only trust forwarded addresses when the immediate and intermediate proxies are explicitly trusted. */
export function makeClientAddressResolver(trustedRanges: string[]): (request: IncomingMessage) => string {
  const ranges = trustedRanges.map((range) => range.trim()).filter(Boolean);
  if (ranges.some((range) => !ipaddr.isValid(range) && !ipaddr.isValidCIDR(range))) {
    throw new Error('MEETY_TRUSTED_PROXIES must contain only verified IP addresses or CIDR ranges.');
  }
  const trust = ranges.length ? proxyaddr.compile(ranges) : null;
  return (request) => {
    const socket = request.socket.remoteAddress ?? 'unknown';
    const address = trust ? proxyaddr(request, trust) : socket;
    try { return ipaddr.process(address).toNormalizedString(); }
    catch {
      try { return ipaddr.process(socket).toNormalizedString(); }
      catch { return 'unknown'; }
    }
  };
}
