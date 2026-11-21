# Spend Snapshot

Upload a Chase credit card CSV and see where your money goes: spending by category,
monthly trends, and a few simple suggestions.

Don't have a file handy? Click **Try with sample data** to load a made-up example
(`chase_sample_dev.csv`, all transactions fake).

## What it shows

- **Summary:** total spending, number of purchases, date range, and how many rows were
  not counted (card payments and refunds aren't spending).
- **"How do I get my CSV?"** step-by-step download instructions under the upload buttons.
  Uploading a PDF statement shows a friendly message and opens these steps.
- **Suggestions:** up to 3 cards, each showing the numbers it is based on.
- **Charts:** spending by category, and monthly spending stacked by category. An
  "Exclude rent" checkbox hides Rent from the charts so other categories are easier to compare.
- **Tables:** totals per category, and every purchase with the category and the keyword
  rule that matched it.

## Privacy design

**Your data never leaves your browser.**

- The page is plain HTML, CSS, and JavaScript, with no backend, no analytics, and no
  external API calls.
- Your CSV is read with the browser's `FileReader` and processed in memory. Nothing is
  uploaded or stored.
- The one library (Chart.js 4.4.1) is saved in `vendor/`, not loaded from a CDN.
- The page sets a Content Security Policy (`connect-src 'none'`), so the browser blocks
  any network request the page's code might try to make.

You can also download this folder and open `index.html` directly by double-clicking it,
with no server needed.

## How classification works

Categories are assigned by simple keyword rules in [`rules.js`](rules.js):

- Each rule is a keyword plus a category, e.g. `"STARBUCKS"` → Dining.
- Rules are checked from top to bottom, and the **first match wins**. Specific rules come
  before general ones (`"UBER *EATS"` → Dining sits above `"UBER"` → Transportation).
- Matching ignores upper/lower case and extra spaces.
- Anything unmatched goes to **Other**, and the transaction table shows "no match".
- Chase's own Category column is not used.

There are 11 categories: Rent, Utilities, Dining, Transportation, Travel, Shopping,
Daily Essentials (groceries, beauty, pharmacy), Subscriptions, Entertainment,
Social & Gifts, Other.

To change how something is categorized, edit `rules.js`.

## How suggestions work

Rent and Utilities count as **fixed** costs; everything else is **flexible**.
Suggestions always use all purchases, whether or not "Exclude rent" is checked.

1. **Biggest flexible category:** the flexible category with the highest total, and its
   share of flexible spending.
2. **Recurring subscriptions:** Subscriptions charges are grouped by exact description,
   and charges within 10% of each other count as the same subscription. A subscription is
   recurring if it shows up in at least 3 different months and at most once per month.
   The card shows an estimated monthly total and flags price increases and descriptions
   with more than one recurring charge (e.g. two separate Apple subscriptions).
3. **Spending pace this month:** for each flexible category, the spending so far this
   month (days 1 to D, where D is the day of the latest transaction) is compared with the
   average for the same days in earlier months. It shows the largest increase that is at
   least $30 and at least 25%.

## Known limitations

- **Chase credit card CSV only.** It expects the columns Transaction Date, Post Date,
  Description, Category, Type, Amount, Memo. Other banks and Chase checking exports won't load.
- **Rule-based categories.** Keyword rules only cover merchants someone has written a rule
  for, and short keywords can occasionally match the wrong merchant. Unknown merchants
  end up in Other.
- **Credit card spending only.** Rent and peer-to-peer transfers (Venmo, Zelle, etc.)
  are usually paid from a bank account, not a credit card, so they are often missing
  from the picture.
- Suggestions are simple arithmetic, not financial advice.

## Files

| File | What it does |
|---|---|
| `index.html` | Page layout |
| `style.css` | Styling |
| `app.js` | Reading the CSV, totals, charts, suggestions |
| `rules.js` | Keyword → category rules (easy to edit) |
| `sample-data.js` | The fake sample data, embedded so it works without a server |
| `chase_sample_dev.csv` | The same fake sample data as a CSV file |
| `vendor/chart.umd.js` | Chart.js 4.4.1 (MIT license, see `vendor/LICENSE-chartjs.md`) |
