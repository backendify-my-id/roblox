---
name: "browser-inspector"
description: "Picu skill ini jika user meminta untuk menguji halaman web, merekam sesi navigasi browser, atau memeriksa regresi visual UI."
---

# Browser Inspector Skill

Skill ini bertugas membimbing penjelajahan halaman web secara otomatis menggunakan subagent browser.

## Aturan Utama:
1. Pastikan setiap pengujian visual direkam ke dalam video dengan nama rekaman deskriptif.
2. Identifikasi selector HTML secara presisi (gunakan ID unik jika tersedia).
3. Selalu periksa konsol log browser untuk mendeteksi error Javascript yang tidak tertangkap di backend.
