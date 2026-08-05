# OmeGame

An Omegle-style random video chat app built with Next.js, Socket.IO, and PostgreSQL.

## Getting Started

Create a `.env.local` file with the following:

```bash
DATABASE_URL=postgres://...          # PostgreSQL (e.g. Neon) connection string
ADMIN_TOKEN=your-secret-admin-token  # token used to access /admin
NEXT_PUBLIC_SIGNALING_URL=           # optional: socket server URL (defaults to the same origin)
```

Then run the development server:

```bash
npm run dev
```

Open [https://localhost:3000](https://localhost:3000) in your browser. The dev server uses a self-signed HTTPS certificate (see `certificates/`), so your browser may warn about it.

The standalone signaling server runs separately on port 3001:

```bash
npm run dev:server
```

## Analytics & Traffic Tracking

The app records analytics server-side in PostgreSQL whenever a visitor connects (`visits`) or starts a chat (`chat_sessions`):

- page, country, IP, device/OS/browser, timestamps
- **traffic source** — captured from UTM-style query string parameters
- live online count and peak concurrency (snapshots)

### Tracking traffic sources with UTM params

Append UTM parameters to any URL to record where a visitor came from:

```bash
https://yourdomain.com/?utm_source=facebook&utm_medium=social&utm_campaign=alpha-review
```

Supported parameters:

| Parameter        | Notes                                                        |
| ---------------- | ------------------------------------------------------------ |
| `utm_source`     | Primary source (facebook, tiktok, reddit, ...)               |
| `utm_medium`     | Medium (social, cpc, email, ...)                             |
| `utm_campaign`   | Campaign name (alpha-review, launch, ...)                    |
| `source`/`ref`/`from` | Fallbacks used for the source when `utm_source` is absent |

Convention: keep values lowercase and hyphen-separated, e.g. `utm_campaign=alpha-review-2` for a second wave.

### Viewing analytics

Visit `/admin` and log in with the `ADMIN_TOKEN` from `.env.local`. The dashboard shows live counts, today/all-time totals, peaks, breakdowns (page, country, device, OS, browser, **source, medium, campaign**), a 7-day trend chart, and recent visits/chats.

## Deploying

Both the app and the signaling server are hosted on [Render](https://render.com).

- **App**: a Render web service running the Next.js app. Set `DATABASE_URL` and `ADMIN_TOKEN` as environment variables, with the build command `npm run build` and start command `npm start`.
- **Signaling server**: a separate web service running `server/index.ts` (port 3001). In the app's environment, set `NEXT_PUBLIC_SIGNALING_URL` to the signaling service's URL.
