export const PUBLISHED_STATUS = 'Published & Live'

const IN_PRODUCTION_PREFIX = 'In Production - '

// BookLeaf's production pipeline, in order (matches the API's book statuses).
export const PRODUCTION_STAGES = [
  'Manuscript Received',
  'Editing',
  'Cover Design',
  'Typesetting',
  'Proofreading',
  'ISBN Assignment',
  'Printing',
  'Distribution Setup',
  PUBLISHED_STATUS,
]

export const getStageLabel = (status) => status.replace(IN_PRODUCTION_PREFIX, '')
