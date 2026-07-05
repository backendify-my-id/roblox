---
name: "api-connector"
description: "Picu skill ini saat mengintegrasikan SDK pihak ketiga (Stripe, Midtrans), membuat HTTP client fetch, atau memetakan JSON payload."
---

# API Connector Skill

Skill ini mengatur standarisasi pembuatan modul API Client eksternal dan internal.

## Aturan Utama:
1. Selalu gunakan centralized configuration untuk menyimpan API URL (tidak boleh menulis hardcoded URL di kode aplikasi).
2. Terapkan mekanisme retry dengan exponential backoff untuk request HTTP eksternal yang rentan timeout.
3. Selalu log payload request dan response menggunakan Trace ID untuk kemudahan debugging telemetri.
