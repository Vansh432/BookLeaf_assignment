# BookLeaf portal: frontend

React 19 + Vite single-page app for the author and admin portals. See the [project README](../README.md)
for the full setup, architecture and API.

## Run

```bash
npm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:5000/api/v1
npm run dev            # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint (including React hooks rules) |

`VITE_API_BASE_URL` is the only variable. It is bundled into the public app, so never put secrets in it.

## Structure

```text
src/
├── app/            router and providers
├── layouts/        PortalLayout (sidebar, live-update indicator, notifications)
├── modules/        one folder per domain: pages, components, services, hooks
│   ├── auth/       sign-in, session, protected and role routes
│   ├── books/      My Books, book cards, royalty summary
│   ├── tickets/    author tickets, admin queue, ticket page, AI draft panel
│   ├── authors/    admin author directory and author detail
│   ├── analytics/  admin AI Usage dashboard
│   └── users/      author lookups used by other modules
└── shared/         UI components, hooks (useApiQuery, useAction, sockets), API client, formatting
```

Modules import each other only through their `index.js`. API calls go through `shared/services/api.js`,
which sends cookies, refreshes the session once on a 401, and turns failures into a single error shape.
