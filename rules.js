// rules.js — keyword rules for sorting transactions into categories.
//
// HOW IT WORKS
// - Each rule has a `keyword` and a `category`.
// - For every transaction, the rules are checked from TOP to BOTTOM.
// - The FIRST rule whose keyword appears in the description wins.
// - If no rule matches, the transaction goes to "Other".
//
// Matching ignores upper/lower case and treats runs of spaces as a single space,
// so "UBER *EATS" also matches "UBER   *EATS PENDING".
//
// TIP: put specific keywords ABOVE general ones.
// Example: "UBER *EATS" (Dining) must come before "UBER" (Transportation),
// otherwise Uber Eats orders would be counted as rides.

// The 11 categories, in the order we like to think about them.
var CATEGORIES = [
  "Rent",
  "Utilities",
  "Dining",
  "Transportation",
  "Travel",
  "Shopping",
  "Daily Essentials",
  "Subscriptions",
  "Entertainment",
  "Social & Gifts",
  "Other"
];

var RULES = [
  // ---------- Specific patterns first ----------
  { keyword: "UBER *EATS",      category: "Dining" },          // before "UBER"
  { keyword: "APPLE.COM/BILL",  category: "Subscriptions" },   // before any "APPLE"
  { keyword: "APPLE STORE",     category: "Shopping" },

  // ---------- Rent ----------
  { keyword: "RENT",            category: "Rent" },            // e.g. APPFOLIO RENT PAYMENT

  // ---------- Utilities ----------
  { keyword: "PEOPLES GAS",     category: "Utilities" },       // before gas stations
  { keyword: "DUQUESNE LIGHT",  category: "Utilities" },
  { keyword: "COMCAST",         category: "Utilities" },
  { keyword: "XFINITY",         category: "Utilities" },
  { keyword: "VERIZON",         category: "Utilities" },

  // ---------- Subscriptions ----------
  { keyword: "CHATGPT",         category: "Subscriptions" },
  { keyword: "OPENAI",          category: "Subscriptions" },
  { keyword: "NETFLIX",         category: "Subscriptions" },
  { keyword: "SPOTIFY",         category: "Subscriptions" },
  { keyword: "PLANET FITNESS",  category: "Subscriptions" },   // gym

  // ---------- Dining ----------
  { keyword: "DOORDASH",        category: "Dining" },
  { keyword: "STARBUCKS",       category: "Dining" },
  { keyword: "CHIPOTLE",        category: "Dining" },
  { keyword: "PRIMANTI",        category: "Dining" },
  { keyword: "SWEETGREEN",      category: "Dining" },
  { keyword: "ESPRESSO",        category: "Dining" },
  { keyword: "COFFEE",          category: "Dining" },

  // ---------- Transportation ----------
  { keyword: "UBER",            category: "Transportation" },  // rides (Eats handled above)
  { keyword: "LYFT",            category: "Transportation" },
  { keyword: "PRT CONNECTCARD", category: "Transportation" },  // Pittsburgh transit
  { keyword: "SHELL",           category: "Transportation" },  // gas station
  { keyword: "EXXON",           category: "Transportation" },
  { keyword: "SUNOCO",          category: "Transportation" },
  { keyword: "SHEETZ",          category: "Transportation" },

  // ---------- Travel ----------
  { keyword: "DELTA AIR",       category: "Travel" },
  { keyword: "UNITED",          category: "Travel" },
  { keyword: "AMTRAK",          category: "Travel" },
  { keyword: "AIRBNB",          category: "Travel" },
  { keyword: "MARRIOTT",        category: "Travel" },

  // ---------- Daily Essentials (groceries, beauty, pharmacy) ----------
  { keyword: "TARGET",          category: "Daily Essentials" },
  { keyword: "TRADER JOE",      category: "Daily Essentials" },
  { keyword: "GIANT EAGLE",     category: "Daily Essentials" },
  { keyword: "WHOLEFDS",        category: "Daily Essentials" },
  { keyword: "WHOLE FOODS",     category: "Daily Essentials" },
  { keyword: "CVS",             category: "Daily Essentials" },
  { keyword: "ULTA",            category: "Daily Essentials" },
  { keyword: "SEPHORA",         category: "Daily Essentials" },

  // ---------- Entertainment ----------
  { keyword: "STEAMGAMES",      category: "Entertainment" },
  { keyword: "CINEMA",          category: "Entertainment" },
  { keyword: "AMC",             category: "Entertainment" },
  { keyword: "BOWLERO",         category: "Entertainment" },

  // ---------- Social & Gifts ----------
  { keyword: "1-800-FLOWERS",   category: "Social & Gifts" },
  { keyword: "PARTY CITY",      category: "Social & Gifts" },

  // ---------- Shopping (general, keep near the bottom) ----------
  { keyword: "AMZN",            category: "Shopping" },
  { keyword: "AMAZON",          category: "Shopping" },
  { keyword: "NIKE",            category: "Shopping" },
  { keyword: "ZARA",            category: "Shopping" },
  { keyword: "UNIQLO",          category: "Shopping" },
  { keyword: "BEST BUY",        category: "Shopping" },
  { keyword: "ETSY",            category: "Shopping" }
];
