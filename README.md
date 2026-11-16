# Couch Remote

A phone remote for **Couch TV**. It drives the TV, and it can do the two things a plastic remote
cannot: put a **message on the screen** from anywhere in the house, and let you **draw with a finger**
and send the sketch to the TV.

Built as a phone-first web app (Vite + React) that talks to the [couch-tv](https://github.com/Seagey/couch-tv)
bridge on your own computer. There is no account, no cloud database and no analytics: the app is a
remote, and the bridge is the thing that knows your TV.

## What it does

- **Remote**: direction pad, OK, back, home, volume, mute, power, and who is watching.
- **Messages**: quick presets, typed lines, or dictation. The line appears over Couch TV with your
  name on it, for 15 seconds to two minutes, and any key on the TV remote closes it.
- **Drawings**: sketch with a finger, pick a colour and brush size, and send it to the TV full screen.
- **AI wording**: with an API key on the bridge, "pizza is here come downstairs" arrives as a warm
  line instead. Without a key, your words go through untouched and the app says so.
- **Installs like an app**: web manifest, icons, standalone mode, safe-area aware. Add to Home
  Screen and it opens full screen.

## Bridge requirements

The remote works with a stock couch-tv bridge. **Messages and drawings need three endpoints that are
not in upstream couch-tv yet**: `POST /api/message`, `GET /api/message`, `POST /api/message/clear`
(`bridge/say.py` beside them does the optional AI wording). Without them the pad still drives the TV
and the message sheet answers with a 404.

## Setup

The app needs to know where the bridge is. On first open, enter its address:

| Where the phone is | Address to enter |
|---|---|
| Same Wi-Fi as the computer | `192.168.1.20:5400` (the computer's local IP, port 5400) |
| Away from home, behind a tunnel | `https://your-tunnel-hostname` |

If the bridge has a `pairing_key` in its `config.json`, paste it on the same screen. Both are stored
on the phone only, so one deployment serves every household.

### Voice needs HTTPS

Browsers only hand over the microphone on a **secure origin**. On a plain `http://` address the mic
button stays disabled and dictation is unavailable; that is the browser, not the app. Open the
tunnel's `https://` address (Cloudflare Tunnel, Tailscale Funnel, a reverse proxy with a real
certificate) and dictation works.

### From Vercel

1. Import this repo at [vercel.com/new](https://vercel.com/new) (or press the Deploy button above). The framework is detected; `vercel.json`
   pins the build, the SPA rewrite and the manifest's content type.
2. Open the deployment on the phone, enter the bridge address, connect.
3. Add it to the home screen for the full-screen version.

Note that an `https://` page cannot call a plain `http://` address: browsers block mixed content. So
the bridge needs to be reachable over HTTPS too — the tunnel address goes in the same field.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173, also on your Wi-Fi
npm run build    # static files in dist/
```

`npm run dev` is a secure origin on `localhost`, so dictation can be tested there even without a
tunnel.

## How it talks to the bridge

Only the documented endpoints (see the bridge's `API.md`):

| Endpoint | Used for |
|---|---|
| `GET /api/now` | what the TV is showing, volume, power |
| `POST /api/key`, `/api/volume`, `/api/power` | the pad and the buttons |
| `GET /api/people`, `POST /api/who` | who is watching |
| `POST /api/message` | a message or a drawing for the screen |
| `GET /api/message`, `POST /api/message/clear` | what is on screen, and clearing it |
| `GET /api/health` | checking an address before saving it |

Messages are kept per TV on the bridge, so two TVs can show different things. A drawing is sent as a
PNG data URL (under 900 kB) and shown as-is.

## License

MIT. See [LICENSE](LICENSE).
