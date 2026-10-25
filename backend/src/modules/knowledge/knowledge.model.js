import mongoose from 'mongoose';
import { TICKET_CATEGORIES } from '../../config/constants.js';

// One retrievable section of the BookLeaf Knowledge Base. chunkId is stable across edits;
// version and contentHash change with the text, so unchanged chunks keep their embeddings.
const knowledgeChunkSchema = new mongoose.Schema(
  {
    chunkId: { type: String, required: true, unique: true, trim: true },
    section: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    // null means the chunk applies to every category (company overview, tone guidelines).
    category: { type: String, enum: [...TICKET_CATEGORIES, null], default: null },
    keywords: { type: [String], default: [] },
    source: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    contentHash: { type: String, required: true },
    active: { type: Boolean, default: true },
    // Excluded by default: vectors are large and only the vector search stage reads them.
    embedding: { type: [Number], default: undefined, select: false },
    embeddingModel: { type: String, default: null },
    embeddedHash: { type: String, default: null },
    embeddedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false },
  },
);

// Keyword fallback retrieval scans the active chunks of a category.
knowledgeChunkSchema.index({ active: 1, category: 1 });

const KnowledgeChunk = mongoose.model('KnowledgeChunk', knowledgeChunkSchema);

export default KnowledgeChunk;
