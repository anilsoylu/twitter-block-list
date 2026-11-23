# AI Reply Filter for X

A browser extension that keeps posts from accounts on a community list of AI-reply spam accounts out of a person's
view on X, so those accounts get no attention or engagement from that person.

## The list

**Source list**:
The public list of AI-reply accounts published at blockedforaireply.com, fetched as one handle per line.
_Avoid_: Blocklist (when talking to users), ban list

**Listed account**:
An X account whose handle appears on the Source list.
_Avoid_: Bot, blocked user, spammer

**Sync**:
Replacing the local copy of the Source list with the current published version, so both additions and removals apply.
_Avoid_: Refresh, download

**List change**:
The number of handles added and removed by the last Sync that changed the local copy.

## What the person sees

**Collapse**:
Showing a one-line notice in place of a Listed account's post instead of the post itself.
_Avoid_: Hide (that is the other mode), mute

**Hide**:
Removing a Listed account's post from view entirely, with no notice left behind.
_Avoid_: Block, delete

**Notice**:
The one-line card shown in place of a collapsed post, naming the Listed account and offering Reveal and Allowlist.
_Avoid_: Placeholder, banner, warning

**Reveal**:
Showing one collapsed post on request, without changing how other posts by that account are treated.
_Avoid_: Unhide, expand

**Allowlist**:
Accounts the person has chosen to always see, even if they are Listed accounts.
_Avoid_: Whitelist, exceptions

## Engagement

**Engagement**:
Any signal a post's author can gain from a viewer: a view, like, repost, reply, bookmark, share, follow, or profile
visit.

**Engagement lock**:
The state of a revealed post from a Listed account in which the person cannot like, repost, reply to, bookmark, or
share it.
_Avoid_: Read-only mode, disabled post
