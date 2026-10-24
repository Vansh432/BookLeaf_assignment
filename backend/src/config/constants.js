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

// ai: produced by the LLM, fallback: keyword rules used when the LLM is unavailable.
export const CLASSIFICATION_SOURCES = Object.freeze({
  AI: 'ai',
  FALLBACK: 'fallback',
});
