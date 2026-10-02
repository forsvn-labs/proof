# Conquistador review

This fork adds a review panel and four routes for
[Conquistador](https://github.com/forsvn-labs/conquistador). `conquistador review <file.md>`
installs this fork from a pinned commit, starts it on `127.0.0.1`, and opens the document.

## Panel

The editor page shows a **Review** panel with three tabs:

- **Preview**: the document in a channel frame. Set `channel:` in the front matter to `x`,
  `linkedin`, `email`, `search`, or `ad`. The reviewer can choose another frame; that choice is
  not saved. Counters show the channel limits. The X frame splits a thread at each `---` line.
  Front matter keys that frames read: `author`, `handle`, `brand`, `headline`, `subject`,
  `preheader`, `from`, `title`, `description`, `url`, `primary`, `cta`, `image`.
- **Playbooks applied**: the list items of the final section when its heading names playbooks,
  for example `## Playbooks applied` with `- write-social: hook-first opening`.
- **Approval**: the approval stamp.

## Approval stamp

The stamp records the approver's name, the time, and the SHA-256 of the clean document Markdown:
the stored text with every Proof annotation span (comment, suggestion, authorship) removed. Every read compares the stored hash with the
current text. A change clears the stamp. A Proof re-serialization, for example `-` bullets
written as `*`, also clears it; approve again after it.

Only a person in the browser can stamp. The route refuses a request when:

- the token is not the owner link;
- the request has `X-Agent-Id`, Proof client headers, or a non-human `by`;
- the request is not a same-origin browser request (`Sec-Fetch-Site` and `Origin`);
- the sent hash is not the current hash.

A stamp approves one exact text. It does not approve a send, a publication, or spend.

## Routes

| Route | Token | Does |
|---|---|---|
| `GET /documents/:slug/conquistador/review` | any document token | Returns `markdown` (clean text), `sha256`, `channel`, `frontMatter`, `playbooks`, `openCheckFindings`, and `approval` |
| `POST /documents/:slug/conquistador/approval` | owner, browser only | Body `{ approver, sha256 }`. Records the stamp |
| `DELETE /documents/:slug/conquistador/approval` | owner, browser only | Withdraws the stamp |

Check findings arrive as ordinary comments through `POST /documents/:slug/ops` with
`by: "ai:conquistador-check"`. The panel counts the open ones.

Events: `conquistador.approval.stamped`, `conquistador.approval.cleared`, and
`conquistador.approval.withdrawn` appear in `GET /documents/:slug/events/pending`.

## Local only

The server binds `127.0.0.1`. Conquistador starts it with no cloud or S3 settings and never uses
hosted sharing.
