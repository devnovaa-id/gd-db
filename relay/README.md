# gd-db OAuth Relay

A lightweight Cloudflare Worker that handles the Google OAuth dance for zero-setup Drive connection.

## How It Works

1. User clicks "Connect Drive" in Studio → handler generates OTC → redirects to `{relay}/connect?return_url=...&state=...`
2. Relay redirects to Google consent screen with project OAuth credentials
3. User authorizes → Google redirects to `{relay}/callback?code=...&state=...`
4. Relay exchanges code for refresh_token → redirects to `{handler}/studio/api/auth/complete?token=...&state=...`
5. Handler verifies OTC, stores refresh token (encrypted)

## Deploy (maintainer only, once)

```bash
cd relay
npm install -g wrangler
wrangler login
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REDIRECT_URI   # e.g. https://auth.gd-db.dev/callback
wrangler deploy
```

## Security

- OAuth credentials only exist in the relay's secrets — never exposed to users or the handler
- One-time code (OTC) prevents CSRF: handler generates it, verifies on complete, invalidates after use
- Refresh token travels via HTTPS redirect (TLS) + OTC binding
- Relay does NOT store any tokens — passes through immediately
