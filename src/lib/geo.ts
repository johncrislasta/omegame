import geoip from "geoip-lite";

export function countryFromIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const res = geoip.lookup(ip);
  return res?.country;
}
