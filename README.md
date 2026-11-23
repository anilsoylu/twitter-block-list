# AI Reply Filter for X

A Chrome extension that collapses or hides posts on x.com from accounts on the community list at
[blockedforaireply.com](https://blockedforaireply.com/), maintained by @levelsio. This project is not affiliated with
levelsio or X.

## Install

A Chrome Web Store listing is planned. Until then, install the extension from a GitHub release:

1. Download `ai-reply-filter-for-x-<version>-chrome.zip` from the
   [latest release](https://github.com/anilsoylu/twitter-block-list/releases/latest).
   Optionally, download `SHA256SUMS` from the same release into the same folder and verify the zip:
   - Linux/macOS: `sha256sum -c SHA256SUMS` (or `shasum -a 256 -c SHA256SUMS` on older macOS) should print `OK`.
   - Windows (PowerShell): `Get-FileHash ai-reply-filter-for-x-<version>-chrome.zip` should print the same hash as
     `SHA256SUMS`.
2. Unzip it into a folder you will keep. Chrome loads the extension from this folder, so do not delete it.
3. Open `chrome://extensions` and turn on Developer mode (top right).
4. Click "Load unpacked" and select the unzipped folder.

To update, download the new zip, replace the folder's contents with the new files, and click the reload icon on the
extension's card in `chrome://extensions`.

## Privacy

The extension only fetches the public list from blockedforaireply.com. It makes no other network requests, collects no
data, and never calls X's API.

## How it works

The background worker downloads `usernames.txt` from blockedforaireply.com on install, on browser startup, and every
hour. Requests send the previous ETag, so an unchanged list costs a `304` response and leaves the stored list untouched.
When the list does change, both additions and removals apply to open tabs, and the popup shows how many accounts were
added and removed in the last change. The content script reads each post's author handle from the page and matches it
against the stored list locally; nothing is sent to X or any other service.

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

## Releasing

1. Bump the version: `npm version X.Y.Z --no-git-tag-version`.
2. Commit the change to `package.json` and `package-lock.json` and merge it to `master`.
3. Tag the commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.

The release workflow checks that the tag matches `package.json`, runs the type check and unit tests, builds the zip,
and publishes a GitHub release with it attached.
