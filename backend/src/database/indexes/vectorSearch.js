// Atlas Vector Search index over knowledge chunk embeddings. The filter fields let a query
// restrict candidates to active chunks of the ticket's category before similarity ranking.
export const KNOWLEDGE_VECTOR_INDEX = 'knowledge_embedding_index';

export const knowledgeVectorIndex = (numDimensions) => ({
  name: KNOWLEDGE_VECTOR_INDEX,
  type: 'vectorSearch',
  definition: {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions, similarity: 'cosine' },
      { type: 'filter', path: 'active' },
      { type: 'filter', path: 'category' },
    ],
  },
});
