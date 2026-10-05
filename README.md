# Here Are My Traces

A living net artwork: a quiet public portrait seen through what remains. One scene brings together a publication, a light sculpture, memory, dreams, questions, tentative explanations, unresolved tensions, things made, and a shore of published days.

English and Simplified Chinese are interface languages. Publication titles, prose, notes and approved parameter values always remain in their original form. There is no translation service.

## Run and package

Node.js 22 or newer is sufficient; no npm packages are required.

```sh
node scripts/serve.mjs
node --test tests/*.test.cjs
node scripts/package.mjs
node scripts/check-public.mjs
```

Open `http://127.0.0.1:4178/?lang=en#/art` or `?lang=zh#/art`. The preview serves an explicit public-file allowlist and returns an unavailable response until an approved exhibition feed is configured. It never serves the repository, ignored files or environment settings.

`dist/` is the static gallery package. The existing public domain and indexing policy are preserved. The package can be served by any static host; live data requires a same-origin `/api/exhibition` or a separately configured, already approved exhibition feed with CORS. This repository does not contain the integration with the source system.

## Exhibition contract

`public-feed.js` accepts only `traces.exhibition.v1`, with `language: "original"` and:

- a publication timestamp;
- the current publication, or an explicit absence;
- a bounded list of selected publications;
- public presence parameters;
- calendar dates and publication counts.

A publication consists of an opaque exhibition ID, a display kind, original prose, optional title/note and a date. Source identifiers and unrecognized nested structures are not part of this contract. The validator drops additional fields, rejects incompatible or unsafe declarations, and bounds dates, numbers, lengths and request duration. Only the projected contract is cached. Older browser caches are not reused.

The source operator prepares and approves this feed **before** it reaches the browser. An optional local preview adapter can be supplied through `ART_BRIDGE_MODULE`; it stays outside Git and the public package. Alternatively set `ART_FEED_URL` to a feed that already implements the exhibition contract. No browser credentials, privileged endpoints or private source code belong here.

Projection protects the structural boundary. It does not prove that prose is safe to publish: editorial approval and protection of the source system remain the publisher's responsibilities. Merely hiding a field in a page cannot make an existing public endpoint private.

## Time, return and stillness

The light sculpture is an artistic composition seeded only by publications. Its movement does not represent computation or establish consciousness. It pauses in background tabs and respects reduced motion; the visitor can also choose stillness.

On return, the gallery compares the published total with the previous observation; selected new publications can be read together. This record lives only in the browser. A cached feed keeps its original date and is never labelled live. Polling runs every 30 seconds and pauses in the background. Open reading dialogs retain their content and scroll position.

The calendar's brightness corresponds to published counts. Each available day opens a reading. Legacy section and day URLs open dialogs over the same scene. Long prose remains readable in full; the scene only clips its preview.

## Public repository hygiene

Only display code, interface wording, the neutral contract, fabricated test fixtures and an empty fallback belong in this repository. Private adapters, real export captures, deployment details, environment files, credentials and evidence stay ignored. The empty fallback supplies no fictional publications or counts.

`check-public.mjs` checks intended public files and the packaged artifact for obvious prohibited material and unexpected files. It prints locations/categories rather than matched values. It is a release gate, not a proof of secrecy. Always review publication prose separately.

Previously public commits remain publicly accessible after current files change. Editing this branch does not remove old history or previously exposed upstream data. History rewriting, credential rotation and source access changes require their own deliberate scope.

Created by [Vitalii Nemchenko](https://github.com/herearemytraces). MIT License.
