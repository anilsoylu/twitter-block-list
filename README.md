# AI Reply Filter for X

A Chrome extension that collapses or hides posts on x.com from accounts on the community list at
[blockedforaireply.com](https://blockedforaireply.com/), maintained by @levelsio. This project is not affiliated with
levelsio or X.

## Privacy

The extension only fetches the public list from blockedforaireply.com. It makes no other network requests, collects no
data, and never calls X's API.

## How it works

The background worker downloads `usernames.txt` from blockedforaireply.com on install, on browser startup, and every 6
hours. Requests send the previous ETag, so an unchanged list costs a `304` response. The content script reads each post's
author handle from the page and matches it against the stored list locally; nothing is sent to X or any other service.

## Development

```sh
npm install
npm run dev     # starts Chrome with the extension and hot reload
npm run build   # production build in .output/chrome-mv3
```

To load a build manually, open `chrome://extensions`, turn on Developer mode, click "Load unpacked", and select
`.output/chrome-mv3`.

```sh
npm test                          # unit tests
npx playwright install chromium   # once, before the first e2e run
npm run test:e2e                  # end-to-end tests
```
