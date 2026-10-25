export const ROLES = Object.freeze({
  AUTHOR: 'author',
  ADMIN: 'admin',
});

// Mirrors BookLeaf's production pipeline from the knowledge base.
export const BOOK_STATUSES = Object.freeze([
  'Manuscript Received',
  'In Production - Editing',
  'In Production - Cover Design',
  'In Production - Typesetting',
  'In Production - Proofreading',
  'In Production - ISBN Assignment',
  'In Production - Printing',
  'In Production - Distribution Setup',
  'Published & Live',
]);

export const PRINT_PARTNERS = Object.freeze(['In-House', 'Repro India', 'Epitome Books']);

export const SALES_PLATFORMS = Object.freeze(['Amazon India', 'Flipkart', 'Amazon US', 'Amazon UK', 'BookLeaf Store']);

export const TICKET_STATUSES = Object.freeze({
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
});

export const TICKET_CATEGORIES = Object.freeze([
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
]);

// Ordered most to least urgent; the index doubles as the queue sort rank.
export const TICKET_PRIORITIES = Object.freeze(['Critical', 'High', 'Medium', 'Low']);

export const CLASSIFICATION_STATUSES = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

export const AI_OPERATIONS = Object.freeze({
  CLASSIFICATION: 'classification',
  PRIORITY: 'priority',
  SUMMARY: 'summary',
  DRAFT: 'draft',
  EMBEDDING: 'embedding',
});

// success: the provider answered with valid output; failed: the call was attempted and failed;
// rejected: a local guard (budget, limit, circuit, configuration) stopped it before any provider call.
export const AI_CALL_STATUSES = Object.freeze({
  SUCCESS: 'success',
  FAILED: 'failed',
  REJECTED: 'rejected',
});

// rules: deterministic rules were confident, so no model was called; ai: decided by the LLM;
// fallback: the LLM was needed but unavailable, so the rules' best guess was used (and flagged for review).
export const CLASSIFICATION_SOURCES = Object.freeze({
  RULES: 'rules',
  AI: 'ai',
  FALLBACK: 'fallback',
});

// ready: a draft exists; no_policy: no relevant policy was found, so nothing was generated and the
// admin writes the reply; unavailable: AI failed or was refused (budget, limits), so the admin writes it.
export const DRAFT_STATUSES = Object.freeze({
  READY: 'ready',
  NO_POLICY: 'no_policy',
  UNAVAILABLE: 'unavailable',
});

export const PRIORITY_SOURCES = Object.freeze({
  RULES: 'rules',
  AI: 'ai',
});
