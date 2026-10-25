# BookLeaf_assignment

## Database setup (MongoDB Atlas)

Atlas is required for Vector Search, which powers knowledge-base retrieval for AI-drafted responses.
Plain local MongoDB still runs the app; retrieval then falls back to keyword search.

1. **Create a cluster.** At [cloud.mongodb.com](https://cloud.mongodb.com), create a project and a cluster.
   The free M0 tier supports Vector Search.
2. **Create a database user.** Under *Security → Database Access*, add a password user with
   *Read and write to any database* (or scope it to the `bookleaf` database).
3. **Allow network access.** Under *Security → Network Access*, add your current IP for local development.
   For the hosted API, add the host's outbound IPs; use `0.0.0.0/0` only if the host has no static IP.
4. **Copy the connection string.** *Connect → Drivers* gives a `mongodb+srv://` URI. Put it in `backend/.env`
   with the database name `bookleaf` added after the host:

   ```env
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/bookleaf?retryWrites=true&w=majority
   ```

   URL-encode special characters in the password. Never commit `.env`.
5. **Configure Gemini.** Set `GEMINI_API_KEY` in `backend/.env`; it is read only by the server.
   The defaults are `gemini-3.8-flash` for generation and `gemini-embedding-2` for embeddings,
   with `EMBEDDING_DIMENSIONS=768`. Without a key the app still runs, and retrieval uses keyword search.
6. **Seed, build indexes and ingest the knowledge base.** From `backend/`:

   ```bash
   npm run seed        # authors, books and admin accounts
   npm run db:indexes  # regular indexes + the Atlas Vector Search index
   npm run kb:ingest   # policy chunks from the knowledge base, embedded with Gemini
   ```

   `kb:ingest` is safe to re-run. Each chunk keeps a stable `chunkId`, and editing its text bumps its `version`.
   Only new or changed chunks are re-embedded, as are chunks embedded with a different model or vector size,
   so a re-run with no changes makes no Gemini calls. The source is
   `backend/src/database/seeders/data/bookleaf_knowledge_base.json`.

### Vector Search index

`npm run db:indexes` manages the `knowledge_embedding_index` index on the `knowledgechunks` collection
(cosine similarity on `embedding`, with `active` and `category` as filter fields). It is only created once
`EMBEDDING_DIMENSIONS` is set to the vector size of the chosen embedding model. Until then the script builds
the regular indexes and skips this step. Re-running the script is safe. It leaves an up-to-date index alone,
and it updates the index in place if the dimensions change. After a change, existing chunk embeddings must be
regenerated. Against a deployment without Atlas Search, the script exits with an error that says so.
