# Associated links deployment

The mobile app claims `https://keeper.sh/open/*` links. The Keeper web server
serves both platform association documents from `/.well-known` and deliberately
returns `503` until real signing identities are configured.

Set these values in the deployed web service:

- `MOBILE_IOS_TEAM_ID`: the 10-character Apple Developer Team ID used to sign
  the App Store/TestFlight build. Keeper's current signing team is
  `HQLM8PHWCM`.
- `MOBILE_IOS_BUNDLE_ID`: optional; defaults to `sh.keeper.mobile`.
- `MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS`: comma-separated SHA-256 fingerprints
  for every trusted Android signing certificate. Include the Google Play App
  Signing certificate for Play builds, and add a separate fingerprint only for
  another distribution channel that should open verified links.
- `MOBILE_ANDROID_PACKAGE_NAME`: optional; defaults to `sh.keeper.mobile`.

Retrieve the Apple Team ID from the Apple Developer membership page. Retrieve
the production Android fingerprint from Play Console → Setup → App integrity →
App signing key certificate. Do not use the upload-key fingerprint for Play
builds and do not commit either value to this repository.

After deployment, verify the exact unredirected HTTPS responses:

```sh
curl -i https://www.keeper.sh/.well-known/apple-app-site-association
curl -i https://www.keeper.sh/.well-known/assetlinks.json
```

Both must return `200` with `application/json`, no authentication, and no
redirect. The canonical-host redirect must explicitly bypass both `/.well-known`
paths; Apple and Android do not follow that redirect for association checks.
The iOS passkey and RP checks can be run together from the mobile directory:

```sh
bun run verify:passkeys
```

Then install store-signed builds and verify an `/open/...` link on a
physical iOS and Android device. DNS/TLS, Apple entitlement provisioning, and
store signing remain external deployment responsibilities.
