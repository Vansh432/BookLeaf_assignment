import { TICKET_PRIORITIES } from '../../config/constants.js';

// Bump when rules change, so stored suggestions can be traced to the rules that produced them.
export const TRIAGE_RULES_VERSION = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Royalty policy: paid quarterly within 45 days of quarter end, minimum payout ₹1,000.
const PAYOUT_CYCLE_DAYS = 90 + 45;
const MIN_PAYOUT = 1000;
const LARGE_ORDER_COPIES = 50;

// Each category signal counts once. A category is decided by rules only when it clearly leads.
const STRONG_SCORE = 3;
const LEAD_FACTOR = 2;

const CATEGORY_SIGNALS = {
  'Royalty & Payments': [
    ['royalty', /\broyalt(y|ies)\b/, 3],
    ['payout', /\b(payouts?|paid|payments?|bank (account|details)|transfer)\b/, 1],
  ],
  'ISBN & Metadata Issues': [
    ['isbn', /\bisbn\b/, 3],
    ['metadata', /\bmetadata\b/, 2],
    ['wrong-details', /\b(wrong|incorrect|misspelled) (title|subtitle|author name|name)\b/, 2],
  ],
  'Printing & Quality': [
    ['print-quality', /\bprint(ing)? quality\b/, 3],
    ['defect', /\b(misprint|binding|blurry|blurred|smudg|faded|torn|misaligned|defect|damaged|pages? (missing|out of order)|colou?r (issue|inconsisten|wrong))/, 3],
    ['reprint', /\breprint/, 2],
    ['author-copies', /\bauthor cop(y|ies)\b/, 1],
  ],
  'Distribution & Availability': [
    ['unavailable', /\b(currently unavailable|unavailable|out of stock|not (listed|showing|available|visible)|can'?t find (it|my book))\b/, 3],
    ['platform', /\b(amazon|flipkart|bookleaf store)\b/, 1],
    ['listing', /\blisting\b/, 1],
  ],
  'Book Status & Production Updates': [
    ['stage', /\b(typesetting|proofread(ing)?|cover design|editing|manuscript|production|proofs?)\b/, 3],
    ['progress', /\b(still in|when will|status of|how long|delayed|stuck)\b/, 1],
  ],
  'General Inquiry': [
    ['profile', /\b(author bio|update (the |my )?(book )?(description|bio|photo|profile))\b/, 3],
    ['account', /\b(package|account|password|log ?in|contract|bestseller breakthrough|standard free)\b/, 2],
  ],
};

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const MONTHS_PER_UNIT = { month: 1, quarter: 3, year: 12 };
const DURATION = /\b(\d{1,2}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(month|quarter|year)s?\b/g;

// Text that addresses the system rather than the support team. Keyword rules can be steered by such text
// ("respond with category Royalty..."), so tickets containing it always get a model assessment and a review flag.
const INJECTION_PATTERNS = /(ignore (all |any )?(previous|prior|above) (instructions|rules)|system override|<\/?ticket>|\b(category|priority)\s*:|\b(classify|categori[sz]e|mark) (this|it) as\b|respond with (category|priority))/i;

export const looksLikeInjection = (text) => INJECTION_PATTERNS.test(text);

export const normalizeTicketText = ({ subject, description }) =>
  `${subject}\n${description}`.toLowerCase().replace(/[‘’]/g, "'");

// Longest duration the author states (e.g. "6 months", "two quarters"); null when none is stated.
export const statedMonths = (text) => {
  const months = [...text.matchAll(DURATION)].map(
    ([, amount, unit]) => (WORD_NUMBERS[amount] ?? Number(amount)) * MONTHS_PER_UNIT[unit],
  );
  return months.length ? Math.max(...months) : null;
};

export const classifyCategoryByRules = (text) => {
  const scored = Object.entries(CATEGORY_SIGNALS)
    .map(([category, signals]) => {
      const matched = signals.filter(([, pattern]) => pattern.test(text));
      return {
        category,
        score: matched.reduce((sum, [, , weight]) => sum + weight, 0),
        signals: matched.map(([name]) => `category:${name}`),
      };
    })
    .sort((a, b) => b.score - a.score);

  const [top, runnerUp] = scored;
  const strong = top.score >= STRONG_SCORE && top.score >= runnerUp.score * LEAD_FACTOR;

  return {
    category: top.score > 0 ? top.category : null,
    strong,
    score: top.score,
    signals: scored.flatMap((entry) => entry.signals),
  };
};

const formatInr = (amount) => `₹${amount.toLocaleString('en-IN')}`;

// Overdue royalties proven by the book record (not by the author's claim): at least ₹1,000 pending
// and no payout for more than one payout cycle.
const verifiedRoyaltyDelay = (book, now) => {
  if (!book || book.royaltyPending < MIN_PAYOUT) {
    return null;
  }

  const since = book.lastRoyaltyPayoutDate ?? book.publicationDate;
  if (!since) {
    return null;
  }

  const days = Math.floor((now - new Date(since)) / MS_PER_DAY);
  return days > PAYOUT_CYCLE_DAYS ? { days, pending: book.royaltyPending, hasPayout: Boolean(book.lastRoyaltyPayoutDate) } : null;
};

const NON_PAYMENT = /\b(not (been )?(received|paid|credited)|haven'?t (been )?(received|paid|got)|no royalt|never (received|been paid)|still waiting|overdue|delayed|late\b|not paid|missing (royalt|payment))/;

const royaltyRule = (text, book, now) => {
  if (!/\b(royalt(y|ies)|payouts?|payments?|paid)\b/.test(text) || !NON_PAYMENT.test(text)) {
    return null;
  }

  const months = statedMonths(text);
  const delay = verifiedRoyaltyDelay(book, now);
  const evidence = [
    months && `author states ${months} month(s) without payment`,
    delay &&
      `book record: ${formatInr(delay.pending)} pending, ${delay.hasPayout ? 'last payout' : 'published'} ${delay.days} days ago`,
  ].filter(Boolean);

  if ((months ?? 0) >= 6 || delay?.days > PAYOUT_CYCLE_DAYS + 90) {
    return { priority: 'Critical', signal: 'royalty-seriously-overdue', reason: `Royalty seriously overdue: ${evidence.join('; ')}` };
  }
  if ((months ?? 0) >= 3 || delay) {
    return { priority: 'High', signal: 'royalty-overdue', reason: `Royalty overdue: ${evidence.join('; ')}` };
  }
  return { priority: 'Medium', signal: 'royalty-not-received', reason: 'Author reports a missing royalty payment; no overdue duration is stated or on record' };
};

const PRIORITY_RULES = [
  (text) =>
    /\b(lawyer|legal (action|notice)|sue|court|fraud|scam|police)\b/.test(text) && {
      priority: 'Critical',
      signal: 'legal-or-fraud',
      reason: 'Author mentions legal action or fraud',
    },
  royaltyRule,
  (text) =>
    /\bisbn\b/.test(text) &&
    /\b(wrong|incorrect|different|duplicate|mismatch|doesn'?t match|does not match|another book|two books)\b/.test(text) && {
      priority: 'High',
      signal: 'isbn-error',
      reason: 'ISBN error reported (duplicate or wrong book linked); policy treats ISBN errors as high priority',
    },
  (text, book) => {
    if (!/\b(currently unavailable|unavailable|out of stock|not (listed|showing|available|visible)|can'?t find (it|my book))\b/.test(text)) {
      return null;
    }
    // Only a live book is losing sales; one still in production is not expected on platforms yet.
    return book && book.status !== 'Published & Live'
      ? { priority: 'Medium', signal: 'unavailable-not-live', reason: `Availability question, but the book is still "${book.status}"` }
      : { priority: 'High', signal: 'unavailable-for-sale', reason: 'Published book reported unavailable for sale (lost sales)' };
  },
  (text) => {
    if (!/\b(misprint|binding|blurry|blurred|smudg|faded|torn|misaligned|defect|damaged|print(ing)? quality)/.test(text)) {
      return null;
    }
    const copies = Math.max(0, ...[...text.matchAll(/\b(\d{2,5}) (copies|books|orders)\b/g)].map(([, count]) => Number(count)));
    return copies >= LARGE_ORDER_COPIES
      ? { priority: 'High', signal: 'print-defect-bulk', reason: `Print defects reported across ${copies} copies` }
      : { priority: 'Medium', signal: 'print-defect', reason: 'Print quality defect reported; free reprint after verification' };
  },
  (text) =>
    /\b(typesetting|proofread(ing)?|cover design|editing|production)\b/.test(text) &&
    /\b(still|delay(ed)?|stuck|how long|when will|weeks?|months?)\b/.test(text) && {
      priority: 'Medium',
      signal: 'production-delay',
      reason: 'Production progress or delay question',
    },
  (text) =>
    /\b(can i|how (do|can) i|is it possible|i would like to|i want to|update (the |my )?(book )?(description|bio|photo|profile)|author bio)\b/.test(text) && {
      priority: 'Low',
      signal: 'information-request',
      reason: 'Information or routine change request with no loss reported',
    },
];

const rank = (priority) => TICKET_PRIORITIES.indexOf(priority);

export const higherPriority = (a, b) => (rank(a) <= rank(b) ? a : b);

// Every matching rule is evaluated and the most urgent wins, so a routine phrasing ("can I...")
// never hides a serious signal in the same ticket. matched is false when no rule applied.
export const assessPriorityByRules = (text, book = null, now = new Date()) => {
  const matches = PRIORITY_RULES.map((rule) => rule(text, book, now)).filter(Boolean);

  if (!matches.length) {
    return { matched: false, priority: 'Medium', reason: 'No urgency signals found; default priority', signals: [] };
  }

  const top = matches.reduce((best, match) => (rank(match.priority) < rank(best.priority) ? match : best));
  return {
    matched: true,
    priority: top.priority,
    reason: top.reason,
    signals: matches.map((match) => `priority:${match.signal}`),
  };
};
