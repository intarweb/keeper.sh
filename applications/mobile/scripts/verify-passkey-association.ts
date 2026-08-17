const serverUrl = new URL(
  process.env.EXPO_PUBLIC_KEEPER_SERVER_URL ?? "https://www.keeper.sh",
);
const teamId = process.env.KEEPER_IOS_TEAM_ID ?? "HQLM8PHWCM";
const bundleId = process.env.KEEPER_IOS_BUNDLE_ID ?? "sh.keeper.mobile";
const expectedAppId = `${teamId}.${bundleId}`;

const associationUrl = new URL(
  "/.well-known/apple-app-site-association",
  serverUrl,
);
const associationResponse = await fetch(associationUrl, { redirect: "manual" });

if (associationResponse.status >= 300 && associationResponse.status < 400) {
  throw new Error(
    `AASA must not redirect (${associationResponse.status} → ${associationResponse.headers.get("location") ?? "unknown"}).`,
  );
}
if (!associationResponse.ok) {
  throw new Error(`AASA returned HTTP ${associationResponse.status}.`);
}
if (
  !associationResponse.headers.get("content-type")?.includes("application/json")
) {
  throw new Error("AASA must be served as application/json.");
}

const association = (await associationResponse.json()) as {
  webcredentials?: { apps?: unknown };
};
if (
  !Array.isArray(association.webcredentials?.apps) ||
  !association.webcredentials.apps.includes(expectedAppId)
) {
  throw new Error(`AASA webcredentials.apps must include ${expectedAppId}.`);
}

const optionsUrl = new URL(
  "/api/auth/passkey/generate-authenticate-options",
  serverUrl,
);
const optionsResponse = await fetch(optionsUrl, { redirect: "manual" });
if (!optionsResponse.ok) {
  throw new Error(`Passkey options returned HTTP ${optionsResponse.status}.`);
}
const options = (await optionsResponse.json()) as { rpId?: unknown };
if (options.rpId !== serverUrl.hostname) {
  throw new Error(
    `Passkey RP ID ${String(options.rpId)} does not match ${serverUrl.hostname}.`,
  );
}

console.log(
  `Passkey association verified for ${expectedAppId} on ${serverUrl.hostname}.`,
);
