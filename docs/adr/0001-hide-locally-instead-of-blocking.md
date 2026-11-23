# Hide listed accounts locally instead of blocking them through X

The source list has thousands of accounts, and the usual approach is to block each one from the person's X account,
often by handing the list to an AI agent. We hide their posts in the page instead and never call X's API, because
blocking thousands of accounts with the person's session is slow, runs into X's rate limits, risks the person's
account, and needs the cookies and private endpoints that Chrome Web Store reviewers scrutinise.

## Consequences

- The person's X account is untouched: Listed accounts can still see and reply to the person's posts, and removing the
  extension restores everything.
- Posts are hidden before the browser first lays them out, so the page never reports them as visible. Anything X
  counts on its servers when it sends the timeline is outside our reach.
- Matching uses the visible handle, because the source list has no numeric account IDs. An account that changes its
  handle stays visible until the list catches up.
