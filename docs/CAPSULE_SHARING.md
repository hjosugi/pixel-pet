# Capsule sharing

Pixel-pet exchange stays local-first. A capsule is a JSON file a user chooses to
export, send, scan, or import. There is no marketplace trust model in this
repository.

## QR design

QR sharing should be a transport for the same capsule schema, not a separate
schema.

Small capsules can be encoded directly:

```txt
pixel-pet-capsule:v1:<base64url-json>
```

Large capsules should use a local share link created by the user:

```txt
pixel-pet-capsule-link:v1:<https-url-or-file-token>
```

QR payload rules:

- Prefer direct QR only when the encoded payload stays under practical scanner
  limits.
- Keep owner notes short.
- Do not include API keys, chat history, local file paths, or machine-specific
  state.
- Import must run the same JSON validation path used by file import.

## Signature fields

The JSON schema reserves this field today:

```json
{
  "signature": {
    "status": "unsigned",
    "algorithm": null,
    "publicKeyId": null,
    "value": null,
    "signedFields": ["schema", "schemaVersion", "compatibility", "exportedAt", "pet"]
  }
}
```

Future signed capsules should set:

```json
{
  "status": "signed",
  "algorithm": "ed25519",
  "publicKeyId": "owner-key-id",
  "value": "base64url-signature"
}
```

The signature covers canonical JSON for `signedFields`. Import must reject a
capsule as tampered once signature verification exists and the signature does
not match those fields.

## Trust states

Current import states:

```txt
unsigned           valid schema, no signature
unverified-signed  signature fields present, verification not implemented yet
invalid            malformed, unknown pack, unsupported schema, bad progression
```

The app can import unsigned and unverified signed capsules only after schema
validation. It must not display either as trusted. A future trusted state should
require successful Ed25519 verification against a user-approved public key.
