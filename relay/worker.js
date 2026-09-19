// gd-db OAuth Relay — Cloudflare Worker
// Deploy once; all users share this relay for zero-setup Drive connect.
//
//   wrangler deploy
//
// Required secrets (set via `wrangler secret put`):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI  (e.g. https://gd-db.devnova.workers.dev/callback)

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // GET /connect?return_url=...&state=...
    if (url.pathname === '/connect') {
      const returnUrl = url.searchParams.get('return_url')
      const otc = url.searchParams.get('state')
      if (!returnUrl || !otc) return new Response('Missing return_url or state', { status: 400 })

      // Encode return_url + otc into state so they survive Google's redirect
      const relayState = btoa(JSON.stringify({ return_url: returnUrl, otc }))

      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        response_type: 'code',
        access_type: 'offline',
        scope: DRIVE_SCOPE,
        prompt: 'consent',
        state: relayState,
      })
      return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302)
    }

    // GET /callback?code=...&state=...  (Google redirects here)
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code')
      const relayState = url.searchParams.get('state')
      if (!code || !relayState) return new Response('Missing code or state', { status: 400 })

      try {
        var decoded = JSON.parse(atob(relayState))
      } catch {
        return new Response('Invalid state', { status: 400 })
      }

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          code,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      })
      const tokens = await tokenRes.json()
      if (tokens.error || !tokens.refresh_token) {
        return new Response(`Error: ${tokens.error_description || tokens.error}`, { status: 500 })
      }

      // Redirect to handler's complete endpoint with refresh token + OTC
      const completeUrl = `${decoded.return_url}?token=${encodeURIComponent(tokens.refresh_token)}&state=${decoded.otc}`
      return Response.redirect(completeUrl, 302)
    }

    if (url.pathname === '/error') {
      const message = url.searchParams.get('message') || 'Unknown error'
      return new Response(`Connection error: ${message}`, { status: 400, headers: { 'content-type': 'text/plain' } })
    }

    return new Response('gd-db OAuth Relay', { status: 200 })
  },
}
