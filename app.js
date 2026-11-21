// app.js — the main logic for Spend Snapshot.
//
// Flow:  file or sample data -> read text -> parse CSV -> check columns
//        -> keep purchases ("Sale"), count excluded rows -> classify with rules.js
//        -> show summary + tables.
//
// PRIVACY: everything here runs in your browser. Nothing is uploaded or sent anywhere.

// The columns a Chase CSV must have.
var REQUIRED_COLUMNS = ["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount", "Memo"];

// One color per category, used by BOTH charts so they always match.
var CATEGORY_COLORS = {
  "Rent":             "#4E79A7",
  "Utilities":        "#76B7B2",
  "Dining":           "#F28E2B",
  "Transportation":   "#59A14F",
  "Travel":           "#EDC948",
  "Shopping":         "#E15759",
  "Daily Essentials": "#B07AA1",
  "Subscriptions":    "#FF9DA7",
  "Entertainment":    "#9C755F",
  "Social & Gifts":   "#2F8F9D",
  "Other":            "#BAB0AC"
};

// The purchases currently on screen, kept so the "Exclude rent" checkbox can redraw the charts.
var currentPurchases = [];

// The two Chart.js chart objects (we destroy old ones before drawing new ones).
var categoryChart = null;
var monthlyChart = null;

// ---------- Grab the page elements we need ----------
var dropZone = document.getElementById("drop-zone");
var fileInput = document.getElementById("file-input");
var sampleButton = document.getElementById("sample-button");
var statusEl = document.getElementById("status");
var errorEl = document.getElementById("error");
var resultsEl = document.getElementById("results");

// ---------- Wire up the upload controls ----------

// 1) File picker
fileInput.addEventListener("change", function () {
  if (fileInput.files.length > 0) {
    readFile(fileInput.files[0]);
  }
  fileInput.value = ""; // reset so picking the same file again still works
});

// 2) Drag and drop
dropZone.addEventListener("dragover", function (event) {
  event.preventDefault(); // needed so the browser allows dropping here
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", function () {
  dropZone.classList.remove("dragging");
});
dropZone.addEventListener("drop", function (event) {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  var files = event.dataTransfer.files;
  if (files.length > 0) {
    readFile(files[0]);
  }
});

// If a file is dropped outside the upload area, don't let the browser
// navigate away and open the file.
window.addEventListener("dragover", function (event) { event.preventDefault(); });
window.addEventListener("drop", function (event) { event.preventDefault(); });

// 3) Sample data button (SAMPLE_CSV comes from sample-data.js)
sampleButton.addEventListener("click", function () {
  analyze(SAMPLE_CSV, "sample data");
});

// 4) "Exclude rent" checkbox: redraw only the charts (summary and table stay the same).
document.getElementById("exclude-rent").addEventListener("change", function () {
  drawCharts();
});

// ---------- Reading the file ----------

function readFile(file) {
  // A PDF is almost always a monthly statement, not the CSV we need. (v0.4)
  if (isPdfFile(file)) {
    showPdfHelp();
    return;
  }

  // FileReader reads the file locally, inside the browser.
  var reader = new FileReader();
  reader.onload = function () {
    analyze(reader.result, file.name);
  };
  reader.onerror = function () {
    showError(["Sorry, we couldn't read that file.", "Please try again or choose a different file."]);
  };
  reader.readAsText(file);
}

// ---------- The main analysis ----------

function analyze(text, sourceName) {
  // Show "Analyzing..." and hide old results/errors.
  statusEl.hidden = false;
  errorEl.hidden = true;
  resultsEl.hidden = true;

  // Wait a moment so the browser can actually paint "Analyzing..." before we work.
  setTimeout(function () {
    try {
      var result = processCsv(text);
      if (result.isPdf) {
        showPdfHelp();
      } else if (result.error) {
        showError(result.error);
      } else {
        showResults(result, sourceName);
      }
    } catch (err) {
      // Safety net for anything unexpected.
      showError(["Something went wrong while analyzing this file.", String(err.message || err)]);
    }
    statusEl.hidden = true;
  }, 50);
}

// Turns raw CSV text into analyzed data, or returns { error: [...] }.
function processCsv(text) {
  // Remove an invisible "byte order mark" some programs add at the start of files.
  text = text.replace(/^﻿/, "");

  // Every PDF file starts with "%PDF". This catches a PDF that was renamed to .csv.
  if (text.indexOf("%PDF") === 0) {
    return { isPdf: true };
  }

  var rows = parseCsv(text);
  if (rows.length === 0) {
    return { error: ["This file looks empty.", "Please choose a Chase credit card CSV export."] };
  }

  // Check that every required column is present in the header row.
  var header = rows[0].map(function (h) { return h.trim(); });
  var missing = REQUIRED_COLUMNS.filter(function (col) { return header.indexOf(col) === -1; });
  if (missing.length > 0) {
    return {
      error: [
        "This doesn't look like a Chase credit card CSV.",
        "Missing column" + (missing.length > 1 ? "s" : "") + ": " + missing.join(", ") + ".",
        "Tip: in Chase, go to your card's activity, choose Download account activity, and pick CSV."
      ]
    };
  }

  // Find which position each column is in (so column order doesn't matter).
  var col = {};
  REQUIRED_COLUMNS.forEach(function (name) { col[name] = header.indexOf(name); });

  var purchases = [];
  var excludedByType = {};  // e.g. { Payment: 5, Return: 2 }
  var excludedCount = 0;

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var type = (row[col["Type"]] || "").trim();
    var date = parseDate(row[col["Transaction Date"]]);
    var amount = parseFloat((row[col["Amount"]] || "").trim());

    // Only "Sale" rows count as spending. Payments, Returns, and anything else
    // (or rows with an unreadable date/amount) are excluded but counted.
    var reason = null;
    if (type !== "Sale") {
      reason = type || "(blank type)";
    } else if (!date || isNaN(amount)) {
      reason = "Unreadable row";
    }
    if (reason) {
      excludedCount++;
      excludedByType[reason] = (excludedByType[reason] || 0) + 1;
      continue;
    }

    var description = (row[col["Description"]] || "").trim();
    var match = classify(description);

    purchases.push({
      date: date,
      description: description,
      // Purchases are negative in Chase files; flip the sign so spending is positive.
      // Work in cents to avoid floating-point rounding errors when adding up.
      cents: Math.round(-amount * 100),
      category: match.category,
      rule: match.rule
    });
  }

  if (purchases.length === 0) {
    return { error: ["We found the right columns, but no purchases (Type \"Sale\") in this file."] };
  }

  return {
    purchases: purchases,
    excludedCount: excludedCount,
    excludedByType: excludedByType
  };
}

// ---------- CSV parsing ----------

// Splits CSV text into rows of fields. Handles:
// - Windows (\r\n) and Unix (\n) line endings
// - fields wrapped in "double quotes" (which may contain commas)
// - "" inside quotes, meaning a literal quote character
// Blank lines are skipped.
function parseCsv(text) {
  var rows = [];
  var row = [];
  var field = "";
  var inQuotes = false;

  for (var i = 0; i < text.length; i++) {
    var ch = text[i];

    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
      else if (ch === '"') { inQuotes = false; }                     // closing quote
      else { field += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      // End of a line. If this is \r\n, skip the \n too.
      if (ch === "\r" && text[i + 1] === "\n") { i++; }
      row.push(field); field = "";
      pushRow(rows, row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Last line (if the file doesn't end with a newline).
  row.push(field);
  pushRow(rows, row);
  return rows;
}

// Adds a row unless it's completely blank.
function pushRow(rows, row) {
  var isBlank = row.every(function (f) { return f.trim() === ""; });
  if (!isBlank) { rows.push(row); }
}

// Turns "MM/DD/YYYY" into a Date, or returns null if it isn't valid.
function parseDate(value) {
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((value || "").trim());
  if (!m) { return null; }
  var d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return isNaN(d.getTime()) ? null : d;
}

// ---------- Classification (uses RULES from rules.js) ----------

// Makes text easy to compare: UPPERCASE and single spaces.
function normalize(text) {
  return text.toUpperCase().replace(/\s+/g, " ").trim();
}

// Returns { category, rule } for a description. First matching rule wins.
function classify(description) {
  var desc = normalize(description);
  for (var i = 0; i < RULES.length; i++) {
    if (desc.indexOf(normalize(RULES[i].keyword)) !== -1) {
      return { category: RULES[i].category, rule: RULES[i].keyword };
    }
  }
  return { category: "Other", rule: null };
}

// ---------- Showing results ----------

function showResults(result, sourceName) {
  var purchases = result.purchases;

  // --- Summary ---
  var totalCents = 0;
  var minDate = purchases[0].date;
  var maxDate = purchases[0].date;
  purchases.forEach(function (p) {
    totalCents += p.cents;
    if (p.date < minDate) { minDate = p.date; }
    if (p.date > maxDate) { maxDate = p.date; }
  });

  document.getElementById("source-name").textContent = "(" + sourceName + ")";
  document.getElementById("total").textContent = formatMoney(totalCents);
  document.getElementById("count").textContent = purchases.length;
  document.getElementById("range").textContent = formatDate(minDate) + " – " + formatDate(maxDate);
  document.getElementById("excluded").textContent = result.excludedCount;
  document.getElementById("excluded-detail").textContent = notCountedSentence(result.excludedByType);

  // --- Category table ---
  var byCategory = {};
  purchases.forEach(function (p) {
    if (!byCategory[p.category]) { byCategory[p.category] = { cents: 0, count: 0 }; }
    byCategory[p.category].cents += p.cents;
    byCategory[p.category].count += 1;
  });

  var categoryRows = Object.keys(byCategory).map(function (name) {
    return { name: name, cents: byCategory[name].cents, count: byCategory[name].count };
  });
  categoryRows.sort(function (a, b) { return b.cents - a.cents; }); // biggest first

  var categoryBody = document.getElementById("category-body");
  categoryBody.innerHTML = "";
  categoryRows.forEach(function (c) {
    var percent = totalCents ? (c.cents / totalCents * 100).toFixed(1) + "%" : "–";
    addRow(categoryBody, [
      { text: c.name },
      { text: formatMoney(c.cents), num: true },
      { text: percent, num: true },
      { text: String(c.count), num: true }
    ]);
  });

  // --- Transaction table (newest first) ---
  var sorted = purchases.slice().sort(function (a, b) { return b.date - a.date; });
  var transactionBody = document.getElementById("transaction-body");
  transactionBody.innerHTML = "";
  sorted.forEach(function (p) {
    addRow(transactionBody, [
      { text: formatDate(p.date) },
      { text: p.description },
      { text: formatMoney(p.cents), num: true },
      { text: p.category },
      p.rule ? { text: p.rule } : { text: "no match", className: "no-match" }
    ]);
  });

  // --- Suggestions (v0.3) --- always use ALL purchases (ignore "Exclude rent").
  showSuggestions(purchases);

  resultsEl.hidden = false;

  // --- Charts (v0.2) --- drawn after the results are visible so they size correctly.
  currentPurchases = purchases;
  drawCharts();
}

// ---------- Suggestions (v0.3) ----------
//
// Up to 3 cards. Each card is { title, sentence, list?, flags?, basedOn }.
// Suggestions always use ALL purchases, whatever the "Exclude rent" box says.

// Fixed costs. Every other category counts as "flexible".
var FIXED_CATEGORIES = ["Rent", "Utilities"];

function isFlexible(category) {
  return FIXED_CATEGORIES.indexOf(category) === -1;
}

function showSuggestions(purchases) {
  var cards = [
    biggestFlexibleCard(purchases),
    subscriptionsCard(purchases),
    spendingPaceCard(purchases)
  ].filter(function (card) { return card !== null; }); // drop cards with nothing to say

  var container = document.getElementById("suggestions");
  container.innerHTML = "";
  cards.slice(0, 3).forEach(function (card) {
    container.appendChild(buildCard(card));
  });
}

// Builds one card's HTML. Uses textContent so file data can't inject anything.
function buildCard(card) {
  var div = document.createElement("div");
  div.className = "suggestion";
  addText(div, "h3", card.title);
  addText(div, "p", card.sentence);
  if (card.list && card.list.length) {
    var ul = document.createElement("ul");
    card.list.forEach(function (item) { addText(ul, "li", item); });
    div.appendChild(ul);
  }
  (card.flags || []).forEach(function (flag) {
    addText(div, "p", flag).className = "flag";
  });
  addText(div, "p", "Based on: " + card.basedOn).className = "based-on";
  return div;
}

function addText(parent, tag, text) {
  var el = document.createElement(tag);
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

// Card 1: the flexible category with the highest total.
function biggestFlexibleCard(purchases) {
  var totals = {};
  var flexibleTotal = 0;
  purchases.forEach(function (p) {
    if (!isFlexible(p.category)) { return; }
    totals[p.category] = (totals[p.category] || 0) + p.cents;
    flexibleTotal += p.cents;
  });

  var top = null;
  Object.keys(totals).forEach(function (c) {
    if (top === null || totals[c] > totals[top]) { top = c; }
  });
  if (top === null || flexibleTotal <= 0) { return null; }

  var percent = (totals[top] / flexibleTotal * 100).toFixed(1);
  var range = dateRange(purchases);
  return {
    title: "Biggest flexible category",
    sentence: top + " is your largest flexible category at " + formatMoney(totals[top]) +
              ", or " + percent + "% of your flexible spending.",
    basedOn: formatMoney(totals[top]) + " of " + formatMoney(flexibleTotal) +
             " flexible spending (everything except Rent and Utilities), " +
             formatDate(range.first) + " – " + formatDate(range.last) + "."
  };
}

// Card 2: recurring subscriptions.
function subscriptionsCard(purchases) {
  var subs = purchases
    .filter(function (p) { return p.category === "Subscriptions"; })
    .sort(function (a, b) { return a.date - b.date; }); // oldest first

  var basedOn = subs.length + " Subscriptions charges. Recurring = same description and " +
                "similar amount (within 10%), in 3+ different months, at most once a month. " +
                "Monthly total uses each one's most recent amount.";

  // Step 1: group charges into "subscriptions".
  // Same exact description AND amount within 10% of that group's latest amount.
  // So APPLE.COM/BILL at $2.99 and at $10.99 become two separate groups.
  var groups = [];
  subs.forEach(function (p) {
    var group = null;
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var latest = g.charges[g.charges.length - 1].cents;
      if (g.description === p.description && Math.abs(p.cents - latest) <= latest * 0.10) {
        group = g;
        break;
      }
    }
    if (!group) {
      group = { description: p.description, charges: [] };
      groups.push(group);
    }
    group.charges.push(p);
  });

  // Step 2: keep only recurring ones: 3+ different months, never twice in one month.
  var recurring = groups.filter(function (g) {
    var months = {};
    g.charges.forEach(function (p) { months[monthKey(p.date)] = true; });
    var monthCount = Object.keys(months).length;
    return monthCount >= 3 && monthCount === g.charges.length;
  });

  if (recurring.length === 0) {
    return {
      title: "Recurring subscriptions",
      sentence: subs.length ? "No recurring subscriptions found." : "No subscription charges found.",
      basedOn: basedOn
    };
  }

  // Step 3: monthly total, list, and flags.
  var monthlyCents = 0;
  var list = [];
  var flags = [];
  var perDescription = {};

  // Sort A–Z by description (then by amount) so same-name charges sit together.
  recurring.sort(function (a, b) {
    if (a.description !== b.description) { return a.description < b.description ? -1 : 1; }
    return a.charges[0].cents - b.charges[0].cents;
  });

  recurring.forEach(function (g) {
    var first = g.charges[0];
    var last = g.charges[g.charges.length - 1];
    monthlyCents += last.cents;
    list.push(g.description + " – " + formatMoney(last.cents) + "/month");
    perDescription[g.description] = (perDescription[g.description] || 0) + 1;

    // (a) Price went up: say when the current price first appeared.
    if (last.cents > first.cents) {
      var since = g.charges.filter(function (p) { return p.cents === last.cents; })[0];
      flags.push(g.description + " went up from " + formatMoney(first.cents) + " to " +
                 formatMoney(last.cents) + " (" + formatMonthYear(since.date) + ").");
    }
  });

  // (b) Several recurring charges from the same description.
  Object.keys(perDescription).forEach(function (d) {
    var n = perDescription[d];
    if (n >= 2) {
      flags.push(n + " separate recurring charges from " + d + " – check if you need " +
                 (n === 2 ? "both." : "all of them."));
    }
  });

  return {
    title: "Recurring subscriptions",
    sentence: "You have " + recurring.length + " recurring subscription" +
              (recurring.length === 1 ? "" : "s") + ", about " + formatMoney(monthlyCents) +
              " per month in total.",
    list: list,
    flags: flags,
    basedOn: basedOn
  };
}

// Card 3: is any flexible category running ahead of its usual pace this month?
function spendingPaceCard(purchases) {
  var title = "Spending pace this month";
  var range = dateRange(purchases);
  var latest = range.last;
  var D = latest.getDate();                // day of month of the latest transaction
  var latestKey = monthKey(latest);
  var earliestKey = monthKey(range.first);
  var earlierMonths = latestKey - earliestKey; // number of months before the latest one

  // e.g. "Nov (through Nov 18)", or just "Nov" if the month is complete.
  var monthName = latest.toLocaleDateString("en-US", { month: "short" });
  var daysInMonth = new Date(latest.getFullYear(), latest.getMonth() + 1, 0).getDate();
  var monthLabel = monthName + (D < daysInMonth
    ? " (through " + latest.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ")"
    : "");

  if (earlierMonths === 0) {
    return { title: title, sentence: "Not enough history yet to compare this month.",
             basedOn: "Needs at least one earlier month of data." };
  }

  // Add up days 1..D for the latest month, and for all earlier months together.
  var current = {};
  var earlier = {};
  purchases.forEach(function (p) {
    if (!isFlexible(p.category) || p.date.getDate() > D) { return; }
    var key = monthKey(p.date);
    if (key === latestKey) {
      current[p.category] = (current[p.category] || 0) + p.cents;
    } else {
      earlier[p.category] = (earlier[p.category] || 0) + p.cents;
    }
  });

  // Find the biggest dollar increase that is at least $30 AND at least 25%.
  var best = null;
  Object.keys(current).forEach(function (c) {
    var now = current[c];
    var usual = Math.round((earlier[c] || 0) / earlierMonths); // average, in cents
    var increase = now - usual;
    var bigEnough = increase >= 3000 && (usual === 0 || increase / usual >= 0.25);
    if (bigEnough && (best === null || increase > best.increase)) {
      best = { category: c, now: now, usual: usual, increase: increase };
    }
  });

  var firstEarlier = range.first;
  var lastEarlier = new Date(latest.getFullYear(), latest.getMonth() - 1, 1);
  var basedOn = "Days 1–" + D + " of " + monthName + " vs. the average of days 1–" + D +
                " in " + earlierMonths + " earlier month" + (earlierMonths === 1 ? "" : "s") +
                " (" + formatMonthYear(firstEarlier) +
                (earlierMonths > 1 ? " – " + formatMonthYear(lastEarlier) : "") + "). " +
                "Flexible categories only; shown when the increase is at least $30 and at least 25%.";

  if (best === null) {
    return { title: title, sentence: "No unusual changes so far this month.", basedOn: basedOn };
  }

  var change = best.usual === 0
    ? "new this month"
    : "+" + Math.round(best.increase / best.usual * 100) + "%";
  return {
    title: title,
    sentence: "So far in " + monthLabel + ", " + best.category + " is " + formatMoney(best.now) +
              " vs. your usual " + formatMoney(best.usual) + " for the same days (" + change + ").",
    basedOn: basedOn
  };
}

// Small helpers for the suggestions.

// A number that is the same for every date in one month (year*12 + month).
function monthKey(date) {
  return date.getFullYear() * 12 + date.getMonth();
}

// Earliest and latest purchase dates.
function dateRange(purchases) {
  var first = purchases[0].date;
  var last = purchases[0].date;
  purchases.forEach(function (p) {
    if (p.date < first) { first = p.date; }
    if (p.date > last) { last = p.date; }
  });
  return { first: first, last: last };
}

// e.g. "Oct 2026"
function formatMonthYear(date) {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ---------- Charts (v0.2) ----------

// Draws (or redraws) both charts from currentPurchases,
// leaving out Rent if the "Exclude rent" box is checked.
function drawCharts() {
  // If Chart.js didn't load (e.g. vendor/chart.umd.js is missing), skip charts
  // but keep the rest of the page working.
  if (typeof Chart === "undefined") {
    document.getElementById("charts").hidden = true;
    document.getElementById("chart-error").hidden = false;
    return;
  }
  if (currentPurchases.length === 0) { return; }

  var excludeRent = document.getElementById("exclude-rent").checked;
  var purchases = currentPurchases.filter(function (p) {
    return !(excludeRent && p.category === "Rent");
  });

  // Remove old charts before drawing new ones.
  if (categoryChart) { categoryChart.destroy(); }
  if (monthlyChart) { monthlyChart.destroy(); }

  // Category totals (in cents), biggest first. Used by both charts so the
  // order and colors match.
  var totals = {};
  var grandTotal = 0;
  purchases.forEach(function (p) {
    totals[p.category] = (totals[p.category] || 0) + p.cents;
    grandTotal += p.cents;
  });
  var categories = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; });

  categoryChart = drawCategoryChart(categories, totals, grandTotal);
  // Months always come from ALL purchases, so excluding rent never drops a month.
  monthlyChart = drawMonthlyChart(purchases, categories, currentPurchases);
}

// Chart A: horizontal bars, one per category, largest at the top.
function drawCategoryChart(categories, totals, grandTotal) {
  return new Chart(document.getElementById("category-chart"), {
    type: "bar",
    data: {
      labels: categories,
      datasets: [{
        data: categories.map(function (c) { return totals[c] / 100; }), // dollars
        backgroundColor: categories.map(colorFor)
      }]
    },
    options: {
      indexAxis: "y",             // makes the bars horizontal
      maintainAspectRatio: false, // fill the .chart-box height from style.css
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            // e.g. "$1,234.56 (12.3%)"
            label: function (ctx) {
              // ctx.raw is in dollars and grandTotal is in cents, so convert first.
              var cents = ctx.raw * 100;
              var percent = grandTotal ? (cents / grandTotal * 100).toFixed(1) : "0.0";
              return formatDollars(ctx.raw) + " (" + percent + "%)";
            }
          }
        }
      },
      scales: {
        x: { ticks: { callback: function (value) { return formatDollars(value, true); } } }
      }
    }
  });
}

// Chart B: one stacked bar per month, each colored piece is a category.
function drawMonthlyChart(purchases, categories, allPurchases) {
  var months = buildMonths(allPurchases);

  // monthTotals[i] = total for month i; amounts[category][i] = that category in month i (cents).
  var monthTotals = months.map(function () { return 0; });
  var amounts = {};
  categories.forEach(function (c) { amounts[c] = months.map(function () { return 0; }); });

  purchases.forEach(function (p) {
    var i = months.indexOf(findMonth(months, p.date));
    amounts[p.category][i] += p.cents;
    monthTotals[i] += p.cents;
  });

  var datasets = categories.map(function (c) {
    return {
      label: c,
      data: amounts[c].map(function (cents) { return cents / 100; }), // dollars
      backgroundColor: colorFor(c)
    };
  });

  return new Chart(document.getElementById("monthly-chart"), {
    type: "bar",
    data: {
      labels: months.map(function (m) { return m.label; }),
      datasets: datasets
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: function (value) { return formatDollars(value, true); } } }
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            // e.g. "Dining: $123.45"
            label: function (ctx) {
              return ctx.dataset.label + ": " + formatDollars(ctx.raw);
            },
            // e.g. "Month total: $2,345.67"
            footer: function (items) {
              return "Month total: " + formatDollars(monthTotals[items[0].dataIndex] / 100);
            }
          }
        }
      }
    }
  });
}

// Lists every month from the earliest to the latest purchase (including empty months).
// Each month looks like { year: 2026, month: 10, label: "Nov (through Nov 18)" }.
function buildMonths(purchases) {
  var first = purchases[0].date;
  var last = purchases[0].date;
  purchases.forEach(function (p) {
    if (p.date < first) { first = p.date; }
    if (p.date > last) { last = p.date; }
  });

  // Only show the year in labels if the data covers more than one year.
  var showYear = first.getFullYear() !== last.getFullYear();

  var months = [];
  var y = first.getFullYear();
  var m = first.getMonth(); // 0 = January
  while (y < last.getFullYear() || (y === last.getFullYear() && m <= last.getMonth())) {
    var name = new Date(y, m, 1).toLocaleDateString("en-US", { month: "short" });
    months.push({ year: y, month: m, label: showYear ? name + " " + y : name });
    m++;
    if (m > 11) { m = 0; y++; }
  }

  // If the latest purchase isn't on the last day of its month, that month is
  // incomplete, so say so in the label, e.g. "Nov (through Nov 18)".
  var daysInLastMonth = new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate();
  if (last.getDate() < daysInLastMonth) {
    var lastMonth = months[months.length - 1];
    var through = last.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    lastMonth.label += " (through " + through + ")";
  }
  return months;
}

// Finds the month object a date belongs to.
function findMonth(months, date) {
  for (var i = 0; i < months.length; i++) {
    if (months[i].year === date.getFullYear() && months[i].month === date.getMonth()) {
      return months[i];
    }
  }
  return null;
}

function colorFor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS["Other"];
}

// Explains the "Not counted" number in plain words (v0.4), e.g.
// "5 card payments and 2 refunds aren't spending, so they're left out of the totals."
function notCountedSentence(byType) {
  var parts = [];   // things that aren't spending
  var total = 0;
  Object.keys(byType).forEach(function (type) {
    var n = byType[type];
    if (type === "Unreadable row") { return; } // explained separately below
    total += n;
    if (type === "Payment") {
      parts.push(n + (n === 1 ? " card payment" : " card payments"));
    } else if (type === "Return") {
      parts.push(n + (n === 1 ? " refund" : " refunds"));
    } else {
      parts.push(n + ' "' + type + '"' + (n === 1 ? " row" : " rows"));
    }
  });

  var sentence = "";
  if (parts.length) {
    sentence = joinWithAnd(parts) +
      (total === 1 ? " isn't spending, so it's left out of the totals."
                   : " aren't spending, so they're left out of the totals.");
  }

  var unreadable = byType["Unreadable row"] || 0;
  if (unreadable) {
    sentence += (sentence ? " " : "") + unreadable +
      (unreadable === 1 ? " row couldn't be read and was skipped."
                        : " rows couldn't be read and were skipped.");
  }

  return sentence || "Every row in the file was counted.";
}

// ["a"] -> "a";  ["a", "b"] -> "a and b";  ["a", "b", "c"] -> "a, b, and c"
function joinWithAnd(items) {
  if (items.length <= 1) { return items.join(""); }
  if (items.length === 2) { return items[0] + " and " + items[1]; }
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
}

// ---------- PDF handling (v0.4) ----------

// True if the file looks like a PDF, by its name or its type.
function isPdfFile(file) {
  return /\.pdf$/i.test(file.name || "") || file.type === "application/pdf";
}

// Friendly message + open the "How do I get my CSV?" steps.
function showPdfHelp() {
  showError([
    "This looks like a PDF statement. Spend Snapshot needs a CSV file.",
    "Follow the steps under \"How do I get my CSV?\" above to download one."
  ]);
  var guide = document.getElementById("csv-guide");
  guide.open = true;
  guide.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Adds one table row. We use textContent (never innerHTML) for file data,
// so text from the CSV can't inject anything into the page.
function addRow(tbody, cells) {
  var tr = document.createElement("tr");
  cells.forEach(function (cell) {
    var td = document.createElement("td");
    td.textContent = cell.text;
    if (cell.num) { td.className = "num"; }
    if (cell.className) { td.className = cell.className; }
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
}

// Shows a friendly error. `lines` is a list of sentences.
function showError(lines) {
  errorEl.innerHTML = "";
  lines.forEach(function (line) {
    var p = document.createElement("p");
    p.textContent = line;
    errorEl.appendChild(p);
  });
  errorEl.hidden = false;
  resultsEl.hidden = true;
  statusEl.hidden = true;
}

// ---------- Formatting helpers ----------

function formatMoney(cents) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Formats a dollar amount (not cents). `short` drops the cents, for chart axes.
function formatDollars(dollars, short) {
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: short ? 0 : 2,
    minimumFractionDigits: short ? 0 : 2
  });
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
