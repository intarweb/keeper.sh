const sha256Hex = (input: string): string =>
  new Bun.CryptoHasher("sha256").update(input).digest("hex");

const equalsInConstantTime = (left: string, right: string): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  let differences = 0;
  for (let position = 0; position < left.length; position += 1) {
    differences += Number(left.codePointAt(position) !== right.codePointAt(position));
  }
  return differences === 0;
};

const verifyChannelToken = (presented: string, storedHash: string): boolean => {
  if (presented.length === 0 || storedHash.length === 0) {
    return false;
  }
  return equalsInConstantTime(sha256Hex(presented), storedHash);
};

export { verifyChannelToken };
