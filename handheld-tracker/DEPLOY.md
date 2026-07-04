# Deploy on your home network

The app runs as **one service on one port** (the backend serves both the API and
the web UI), so any device on your network can open it at
`http://<server-ip>:8787`. It keeps running and scrapes prices daily on its own.

You only need a machine that stays on (a home server, NAS, mini-PC, or Raspberry
Pi). Pick one of the two options below.

---

## Option A — Docker (recommended)

Works on most NAS/home-server setups (Synology, Unraid, a Linux box, a Pi, etc.).

```bash
cd handheld-tracker
cp backend/.env.example backend/.env      # add API keys (optional — runs in mock mode without them)
docker compose up -d --build
```

Then from any device on your network, open:

```
http://<the-server's-LAN-IP>:8787
```

- The SQLite database is persisted in `backend/data/` (a mounted volume), so your
  price history survives restarts and updates.
- `restart: unless-stopped` brings it back automatically after a reboot.
- Update later with: `git pull && docker compose up -d --build`.
- Logs: `docker compose logs -f`. Stop: `docker compose down`.
- To use a different host port, change the left number in `docker-compose.yml`
  (e.g. `- "9000:8787"`).

---

## Option B — Node directly (no Docker)

For a Linux/macOS/Windows machine with **Node 18+**.

```bash
cd handheld-tracker
cp backend/.env.example backend/.env      # optional: add API keys
cd backend && npm install && cd ..        # installs deps (builds better-sqlite3)
npm run deploy                            # builds the UI, then starts the server
```

On boot it prints the address to use, e.g. `on your network: http://192.168.1.50:8787`.

To keep it running in the background and restart on boot, use **pm2**:

```bash
npm install -g pm2
cd backend && npm install && cd .. && npm run build
pm2 start "node server.js" --name handheld-tracker --cwd backend
pm2 save && pm2 startup     # follow the printed command to enable on reboot
```

---

## Windows / Mac PC notes

**Which path?**
- **Windows → use Docker Desktop (Option A).** It avoids native-build pain and
  auto-starts cleanly. Install Docker Desktop, enable "Start Docker Desktop when
  you log in", then run `docker compose up -d --build` in the project folder.
- **Mac → either works.** Bare Node (Option B) is easy if you install the build
  tools: `xcode-select --install` (needed once, so `better-sqlite3` can compile).

**Find the LAN IP to open from other devices:**
- macOS: `ipconfig getifaddr en0` (Wi-Fi) — or System Settings → Network.
- Windows: `ipconfig` → your adapter's **IPv4 Address**.
The server also prints it on boot (`on your network: http://…:8787`).

**Allow it through the firewall** the first time:
- macOS / Windows will prompt to allow `node` (or Docker) to accept incoming
  connections — choose **Allow on private networks**, or other devices can't reach it.

**Keep the PC awake** so daily scrapes run:
- The app scrapes on startup for any missed day, so intermittent uptime still
  backfills. For true daily 9am scrapes, stop the machine from sleeping
  (Windows: Power & sleep → "When plugged in, sleep: Never"; macOS: Settings →
  Battery/Energy → prevent sleeping, or run under `caffeinate`).

**Auto-start on boot/login:**
- Docker Desktop: `restart: unless-stopped` + "start Docker on login" handles it.
- Bare Node on Mac: `pm2 startup` (launchd) as shown above.
- Bare Node on Windows: `npm i -g pm2 pm2-windows-startup && pm2-startup install`,
  then `pm2 start ... && pm2 save`.

## API keys (optional but recommended)

Without keys the app runs in **mock mode** (realistic fake prices) — fully usable
for a demo. To pull real prices, add these to `backend/.env`:

| Key | Enables |
|-----|---------|
| `FIRECRAWL_API_KEY` | Real store/retailer prices (MechDIY, LitNXT, etc.) |
| `KEEPA_API_KEY` | Real Amazon price + history (auto-vetted listings) |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` (+ `EBAY_ENV`) | eBay active-listing prices |

Restart after editing `.env` (`docker compose up -d` or restart the Node process).

---

## Reach it by name (optional)

- Give the server a **static IP** (or DHCP reservation) on your router so the
  address doesn't change.
- Most home networks let you reach it as `http://<hostname>.local:8787` (mDNS).
- This is a **LAN** deployment — don't expose port 8787 to the internet without a
  reverse proxy + HTTPS + auth.
