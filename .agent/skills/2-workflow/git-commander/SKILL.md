---
name: "git-commander"
description: "Picu skill ini jika user meminta untuk melakukan git commit, checkout branch, push kode, atau merapikan riwayat git."
---

# Git Commander Skill

Skill ini mengatur tata cara pengelolaan source control Git yang baik.

## Aturan Utama:
1. Ikuti format Conventional Commits (misal: `feat: add rate limiting`, `fix: resolve port conflict`).
2. Jangan melakukan commit massal sekaligus. Pecah menjadi beberapa commit logis yang lebih kecil.
3. Selalu periksa status workspace (`git status`) sebelum melakukan pemformatan commit.
