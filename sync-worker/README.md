# Username Sync Worker

This worker stores public backup blobs by username in Cloudflare R2.

## Contract

- `POST /usernames/:username`
  - Creates a username marker.
  - Returns `409` if the username already exists.
- `PUT /usernames/:username/backup`
  - Uploads the latest backup for that username.
  - Returns `404` if the username does not exist.
- `GET /usernames/:username/backup`
  - Downloads the latest backup for that username.
  - Returns `404` if the username or backup does not exist.

The app expects `VITE_USERNAME_SYNC_BASE_URL` to point at the deployed worker origin or route prefix.

Examples:

- `https://subtitle-word-tracker-sync.<subdomain>.workers.dev`
- `https://example.com/api/sync`

## Setup

1. Install Wrangler in this folder:

```bash
npm init -y
npm install --save-dev wrangler
```

2. Create the R2 bucket:

```bash
npx wrangler r2 bucket create subtitle-word-tracker-sync
```

3. Optionally lock CORS to your app origin instead of `*`:

```toml
[vars]
ALLOWED_ORIGIN = "https://your-app.example.com"
```

4. Deploy:

```bash
npx wrangler deploy
```

5. Set the app env var:

```bash
VITE_USERNAME_SYNC_BASE_URL="https://subtitle-word-tracker-sync.<subdomain>.workers.dev"
```

## Notes

- This design is intentionally public read/write by username.
- Backups are stored as opaque blobs. The worker does not parse the JSON.
- The app uploads gzip when the browser supports `CompressionStream`; otherwise it uploads plain JSON.
