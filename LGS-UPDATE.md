# LGS-only update

Website onboarding, profile defaults, settings, topic selectors and marketing now target LGS only. Archived TYT/AYT curriculum remains in source. Native storage migrates the previous exam record into examRecords without deleting it and restores the LGS record.

Verification:
- node scripts/test-lgs-only.js
- node scripts/test-lgs-native.js (requires Expo web export in dist-review)
- Expo web and iOS exports completed locally; no App Store binary was submitted.

Community is included from the preceding request. Demo stories are explicitly labeled and expire 72 hours after the community store is first initialized. Student submissions require editorial approval. Existing verified email/password accounts can submit; Google/Apple-only participation is not implemented. Verified teacher status must be assigned by an operator through the user store, not by the registration checkbox. The editor panel uses the existing administrator environment credentials. Group subscriptions and hidden-author preferences currently stay on the device. Native participation opens the website.

Before production community rollout, configure COMMUNITY_FILE to a backed-up persistent volume path. The default .runtime/community.json is local storage and must not be treated as persistent on an ephemeral hosting filesystem. Review the moderation queue operationally. Do not copy local community data, users.json or credentials to Git. Website changes have not been deployed by this update.
