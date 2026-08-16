import { timingSafeEqual } from "node:crypto";

const digestOf = (input: string): string =>
  new Bun.CryptoHasher("sha256").update(input).digest("hex");

const clientStateHash = (secret: string, hash: (input: string) => string): string => hash(secret);

const verifyClientState = (presented: string, storedHash: string): boolean => {
  if (presented.length === 0 || storedHash.length === 0) {
    return false;
  }
  const computed = Buffer.from(digestOf(presented));
  const stored = Buffer.from(storedHash);
  if (computed.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(computed, stored);
};

export { clientStateHash, digestOf, verifyClientState };
