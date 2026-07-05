# Roblox Friend Tracker Project Rules

## 1. WebSocket Connections & Lifecycle
* **Hoisting Connection Logic**: Always initialize and hold WebSocket connections at the root level (`App.jsx` or a dedicated React Context). Avoid placing connection hooks in sub-pages or tab-specific components that unmount when navigating, as this closes the socket.
* **Database-Backed Roles**: Avoid relying solely on JWT claim tokens for WebSocket authorization checks, as they can expire or lack updated roles. Query user roles directly from the database at socket connection time. Normalization checks (such as role case-insensitivity) must be performed.

## 2. Timezone Alignment
* **Date Comparisons**: The database logs timestamps based on local Jakarta server time (Asia/Jakarta / GMT+7). When filtering or rendering "today's logs" on the frontend, adjust UTC string calculations using the local timezone offset to avoid timezone boundaries cutting off active log entries.

## 3. Vite HMR Secure Configuration
* **Conditional Secure HMR**: When updating `vite.config.js` for secure proxy setups behind Cloudflare or HTTPS tunnels, do not hardcode `wss` and port `443`. Instead, gate it behind an environment variable (e.g., `process.env.VITE_HMR_SECURE === 'true'`) to avoid breaking local dev server hot reloading.

## 4. UI Custom Dialog Modals
* **Global Custom Confirmations**: Avoid using browser native `confirm()` or `window.confirm()`. Use the custom global promise-based confirmation handler `window.customConfirm(...)` (implemented at root `App.jsx`) which integrates with the application's premium glassmorphic visual system. Ensure parent trigger handlers are declared as `async/await`.

## 5. Security & Secret Parity
* **Encryption Secrets Sync**: When fetching or working with decrypted database fields (like Roblox cookies), ensure the local `APP_SECRET` in `backend/.env` matches the production/server key (`86fb2b8d5...`). A mismatch in the GCM ciphertext authentication block will throw warning decyption errors (`cipher: message authentication failed`).
