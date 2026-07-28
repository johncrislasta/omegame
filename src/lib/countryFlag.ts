export function countryToFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "";
  const code = countryCode.toUpperCase();
  return String.fromCodePoint(
    code.charCodeAt(0) - 65 + 0x1f1e6,
    code.charCodeAt(1) - 65 + 0x1f1e6
  );
}
