# Security policy

pixel-pet is a local-first desktop pet. It has a deliberately small attack
surface, but it does read a few kinds of untrusted input, so this document
describes the model and how to report issues.

## Reporting a vulnerability

Please report suspected vulnerabilities privately using GitHub's "Report a
vulnerability" button under the repository's **Security** tab (private
vulnerability reporting / security advisories). Do not open a public issue for a
security problem. We will acknowledge the report and follow up on a fix and
disclosure timeline.

## Security model

- **Local-first.** Pet state, progression, settings, external packs, and the
  activity inbox all live in local files under the app data directory. Nothing
  is uploaded.
- **AI is on-demand and optional.** No LLM runs during idle animation, movement,
  focus nudges, or ambient dialogue. Network adapters run only after the user
  submits chat text. An OpenAI key, if used, is held in memory only and is never
  written to the state file.
- **Untrusted input is validated.** Every external input is normalized and
  safely rejected on any mismatch, without changing pet state:
  - Imported pet capsules (JSON) validate schema, version, pack id, traits, and
    progression, and clamp numeric values.
  - External pet packs go through the same strict validation as bundled packs;
    a built-in id always wins so an external pack cannot override or spoof one.
    Declared asset file names are rejected if they contain path separators or
    `..`, so a pack cannot read files outside its own folder.
  - Activity events accept only a fixed set of kinds; source and label strings
    are trimmed and length-capped. Malformed inbox lines are skipped and the
    inbox is drained (removed) after reading.
- **Capsule signatures are not yet trust-bearing.** Imported capsules are
  labeled `unsigned` or `unverified-signed`; neither is treated as trusted. See
  `docs/CAPSULE_SHARING.md`.

## Scope notes

- macOS transparency uses `macOSPrivateApi`, acceptable for a local prototype
  but not for App Store distribution.
- The activity inbox is a local file with no authentication; any local process
  running as the user can write to it. This is by design for a local companion
  and is best-effort, not a trust boundary.
