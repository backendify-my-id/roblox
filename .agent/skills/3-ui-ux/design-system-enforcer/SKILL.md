---
name: "design-system-enforcer"
description: "Picu skill ini saat mendesain UI frontend, menyesuaikan css variables, merancang glassmorphism, atau mengatur animasi hover."
---

# Design System Enforcer Skill

Skill ini mengontrol kualitas visual antarmuka agar selalu premium dan modern.

## Aturan Utama:
1. Hindari penggunaan warna dasar browser (plain red, plain blue). Gunakan palet warna terkurasi (HSL variables).
2. Terapkan glassmorphism secara konsisten menggunakan filter blur (`backdrop-filter: blur(12px)`) dan border tipis semi-transparan.
3. Selalu tambahkan micro-animations halus pada interaksi tombol (`hover:transform`, `transition-all`).
