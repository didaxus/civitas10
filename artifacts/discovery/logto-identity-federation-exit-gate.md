# Logto Identity Federation Discovery Exit Gate

This discovery spike may pass the exit gate only when its evidence artifact is minimized and contains no raw PII, tokens, or secrets.

## Read-only discovery endpoints

The guarded network policy allows only the exact discovery endpoints below on the configured Logto host. Management API calls are read-only (`GET`) except for the exact OAuth token endpoint used to obtain a machine-to-machine credential.

| Method | Sanitized path |
| --- | --- |
| `GET` | `/api/.well-known/sign-in-exp` |
| `GET` | `/api/organizations` |
| `GET` | `/api/organization-roles` |
| `GET` | `/api/sso-connectors` |
| `GET` | `/api/connectors` |
| `GET` | `/api/users` |
| `GET` | `/api/hooks` |
| `GET` | `/api/resources` |
| `GET` | `/api/organizations/{organizationId}/jit-sso-connectors` |

## Evidence artifact requirements

The artifact must be JSON and include only these fields:

```json
{
  "probeVersion": "string",
  "logtoEndpointHash": "sha256",
  "endpoints": [
    {
      "method": "GET",
      "path": "/api/organizations/{organizationId}/jit-sso-connectors",
      "httpStatus": 200,
      "redactedResponseShape": {
        "type": "array",
        "length": 1,
        "itemShape": {
          "type": "object",
          "keys": ["connectorId", "id"],
          "fields": {
            "id": { "type": "string" },
            "connectorId": { "type": "string" }
          }
        }
      }
    }
  ],
  "customTokenScriptClaimShape": {
    "userSsoIdentitiesProfileGroupsAvailable": true
  },
  "externalGroupsPresent": true,
  "groupCompletenessCanBeDetermined": true,
  "stableCorrelationCandidates": [
    { "sourceKey": "id", "hash": "sha256" },
    { "sourceKey": "connectorId", "hash": "sha256" }
  ]
}
```

## Custom Token Script claim-shape verification

The separate claim-shape section verifies whether `user.sso_identities[0].profile.groups` is available to the Custom Token Script runtime. The evidence may record:

- `userSsoIdentitiesProfileGroupsAvailable`: whether the `groups` property is present as an array.
- `externalGroupsPresent`: whether the redacted shape indicates one or more external groups exist.
- `groupCompletenessCanBeDetermined`: `false` when the profile contains overage markers such as `_claim_names.groups`, `hasgroups`, or `groupsOverage`.

## Sanitization gate

The evidence artifact fails the exit gate if it contains any raw email address, phone number, user name, token, secret, cookie, client secret, API key, external group value, Logto user ID, organization ID, connector ID, or SSO identity ID. Stable correlation candidates must be represented with SHA-256 hashes only.
