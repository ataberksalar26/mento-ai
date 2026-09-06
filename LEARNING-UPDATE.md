# Learning update - 2026-09-06

## Delivered
- Web: searchable topic library, direct YouTube links, manual watched state, topic notes, planned/completed topics, actual wrong/blank answers from completed tests.
- Web: persistent focus timer with pause/cancel and idempotent completion, target date, daily minutes, larger text, reduced motion, JSON export of study data only.
- Web: dialog close/reopen race fixed; chat history titles and identifiers escaped before HTML rendering.
- Native Expo: bundled matching topic video catalog, searchable lessons/topics, direct YouTube opening, notes, watched/planned/completed state, daily target and larger library text.
- Native Expo: persisted profile and exam progress, quiz completion guard, bounded score, explicit retry, safe-area provider, scrollable onboarding and improved Turkish labels.

## Verification
- 206 topic entries, 618 video links (three distinct links per topic).
- Initial metadata audit: 528 of 602 unique videos returned oEmbed metadata; 74 returned HTTP 401. This can also mean embedding is disabled. Neither availability nor playback was claimed for these 74.
- Six topic groups had wrong-exam selections adjusted; two replacement candidates were subsequently corrected after title review.
- Full video playback, teaching quality and complete curriculum alignment were not exhaustively reviewed.
- `node scripts/test-ai-budget.js`: six passing budget/schema tests.
- `node scripts/test-ready-tests-ui.js`: private files, pending question bank, exam menu persistence, 30-question results and mobile behavior.
- `node scripts/test-learning-features.js`: real thumbnail loading, direct links, notes/watch/plan persistence, timer controls, non-duplicate completion, accessibility settings, mobile width, zero paid AI calls, native UI persistence and quiz re-entry.
- Expo web export and Android/iOS JavaScript/Hermes exports completed. These are not signed store builds or physical-device tests.

## Remaining / boundaries
- No new generated questions added. Real per-topic tests await the user's question submissions and answer checking; native quick practice still contains only the existing three questions per exam, now labelled accordingly.
- Local study data does not sync between website and phone or between accounts. This is stated in settings.
- Native changes require a new signed EAS build and App Store submission. No submission or approval occurred in this update.
- OAuth, purchases, email delivery and notification delivery were not certified by these tests.
- Existing AI quota ledger still needs persistent hosting storage to survive a full hosting redeployment.
- No claim of a completely bug-free application or guaranteed App Review acceptance.

## Inspiration
https://astra-ai.co/tr/sinav-hazirligi/ - structured study paths and progress tracking.
https://ucdortbesallstar.com/ - topic-linked video learning and study organization.
No proprietary paid course content, branding or testimonial text was copied.
