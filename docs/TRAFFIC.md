# What actually moves traffic

Ranked by measured return, not by how satisfying it is to build. Every claim here comes from
production measurement on a reference property, not from theory.

## 1. Get indexed, then get cited

Indexing — not ranking — is usually the binding constraint. The scorecard probes live URLs and,
with `hooks.inspectUrl`, reports coverage over a **fixed** post cohort so "not indexed" and
"not checked" never look the same.

## 2. The citable passage must survive without JavaScript

The scorecard's `answer-pre-js` check fetches the newest post and asserts the quick answer is in
the raw HTML. A build gate proves a page compiles; only this proves it can be quoted.

## 3. Keep retrieval crawlers allowed

A robots rule blocking `PerplexityBot` or `OAI-SearchBot` is a total citation loss for that
provider, and nothing else in a normal pipeline notices. The scorecard fails on it.

## 4. Refresh what is already on page two

Rank rescue targets positions 8–30 and reports the 11–20 cohort separately. A healthy top-3
result is classified `leave-alone` — not every ranking is a problem to solve. Give a change
45 days to surface before rewriting it again (`content.minDaysBetweenRefresh`).

## 5. Answer verification questions, not head commercial terms

Opt into `topics.preferVerificationIntent`. On the reference property the head commercial term
earned 338 impressions and **zero clicks** at position 24.8, while long-tail verification
questions ("is X legit", "X vs Y") produced both clicks and every observed AI citation.

## 6. Never let two of your own URLs fight

The scorecard flags any query earning ≥10 impressions on two or more pages. The fix is
consolidation or differentiation — never a third page.

## 7. Give the hub an honest lastmod

`blogHubSitemapEntry()` sets the hub's `lastmod` from the newest post. Without it a crawler has
no signal that the index changed; on the reference property that left 880 pages undiscovered for
twelve days.

## 8. Link internally, and never orphan a post

Internal links are the only backlinks you fully control. The corpus audit flags any post nothing
else links to, and every new post is offered the existing corpus as link targets.

## 9. Structured data is hygiene, not a ranking lever

Emit it correctly and move on. Measured `searchAppearance` return on a comparable property was
zero rows over ninety days. The same applies to `llms.txt`: ship it for the assistants that read
it, never as an SEO tactic — Google Search ignores it.

## 10. Publish less than you think

The ASEO cadence policy caps search-led autonomous posts at two per rolling seven days until
reviewed evidence supports more (`content.maxPostsPerWeek`). Volume without evidence is how a
corpus becomes scaled thin content.

## What the engine cannot do for you

Outreach, digital PR, profile claims and paid placement are human work by design — the playbook's
own rule is that you cannot un-email four hundred librarians. The engine automates discovery and
drafting; a person presses send.
