# Spend Snapshot — project brief

A small portfolio project. The owner is not an experienced coder: keep code simple,
well-commented, and free of build tools or frameworks.

## Product
A web page where a user uploads a Chase credit card CSV and sees their spending by
category, monthly trends, and 2-3 simple suggestions.

## HARD RULE — Privacy
- All processing happens in the browser. Never send transaction data anywhere.
- No backend, no analytics, no external API calls.
- Save any libraries locally in a `vendor/` folder instead of loading them from a CDN.

## Input format
- Chase CSV columns: Transaction Date, Post Date, Description, Category, Type, Amount, Memo.
- Purchases have Type "Sale" and negative amounts.
- Exclude Type "Payment" and "Return" from spending totals, but show how many rows were excluded.
- Must handle both Windows (CRLF) and Unix (LF) line endings.

## Categories (11)
Rent, Utilities, Dining, Transportation, Travel, Shopping,
Daily Essentials (groceries, beauty, pharmacy), Subscriptions, Entertainment,
Social & Gifts, Other.

## Classification v1
- Keyword rules only, kept in `rules.js` so they are easy to edit.
- Rules are checked in order and the FIRST match wins, so specific patterns go before
  general ones (e.g. "UBER *EATS" -> Dining must come before "UBER" -> Transportation).
- Anything unmatched goes to Other.
- Do NOT use Chase's own Category column yet.
- Decisions:
  - APPLE.COM/BILL -> Subscriptions; APPLE STORE -> Shopping
  - TARGET -> Daily Essentials
  - AMAZON / AMZN -> Shopping
  - Gas stations -> Transportation
  - Gym memberships and ChatGPT -> Subscriptions

## Files
`index.html`, `style.css`, `app.js`, `rules.js`, `sample-data.js`.
The page must work when `index.html` is opened directly by double-clicking (file://),
with no local server. (So: plain `<script src>` tags, no ES modules, no fetch().)

`chase_sample_dev.csv` is the development sample; its contents are embedded in
`sample-data.js` for the "Try with sample data" button. If the CSV changes,
regenerate `sample-data.js`.

## UI language
English.

## Version history
- v0.1: upload (picker + drag-and-drop), sample data button, "Analyzing..." state,
  summary, category table, transaction table with matched rule, friendly errors,
  privacy note. No charts or suggestions yet.
- v0.2: Chart.js 4.4.1 (UMD, `vendor/chart.umd.js`, verified identical to the npm package)
  charts between summary and category table: horizontal "Spending by category" bar and
  stacked "Monthly spending" bar (incomplete last month labeled "Nov (through Nov 18)").
  Shared colors in `CATEGORY_COLORS` (app.js). "Exclude rent" checkbox affects charts only,
  not the summary cards or category table.
- v0.3: "Suggestions" section right below the summary cards (up to 3 cards, each with title,
  one sentence, gray "Based on:" line). Always uses all purchases (ignores "Exclude rent").
  Fixed = Rent, Utilities; flexible = everything else.
  1. Biggest flexible category (total + % of flexible spending).
  2. Recurring subscriptions: Subscriptions category, grouped by exact description, amounts
     within 10% = same subscription; recurring = 3+ distinct months, max once per month.
     Monthly total from latest amounts; flags price increases and 2+ recurring charges
     from one description.
  3. Spending pace: days 1..D of latest month vs. average of days 1..D in earlier months,
     per flexible category; show the largest increase among those that are >= $30 AND >= 25%,
     else "No unusual changes so far this month."
- v0.4 (fixes from user testing): "Excluded rows" card renamed "Not counted" with a
  plain-English sentence ("5 card payments and 2 refunds aren't spending..."). A
  "How do I get my CSV?" `<details>` guide sits under the upload buttons. PDFs (by name,
  type, or "%PDF" content) show "This looks like a PDF statement..." and open the guide;
  the file picker accepts .pdf on purpose.

## Publishing
- Public repo: https://github.com/sandraliu83/spend-snapshot (branch `main`).
- Live site (GitHub Pages, main branch root): https://sandraliu83.github.io/spend-snapshot/
- Commit author for this repo: Sandra Liu, GitHub noreply email (set in local git config).
