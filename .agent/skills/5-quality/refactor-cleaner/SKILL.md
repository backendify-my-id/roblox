```
name: "refactor-cleaner"
description: "Picu skill ini jika user meminta memfaktorkan ulang kode (refactoring), optimasi performa, membersihkan dead code, mengubah gaya arsitektur (clean/layered architecture), atau modularisasi fungsi untuk menjaga codebase tetap sehat selama siklus vibe coding."

```

# Refactor Cleaner Skill (Vibe Coding Edition)

Skill ini bertugas memandu pembersihan, optimalisasi, penyederhanaan, dan penyehatan basis kode (*codebase*) agar tetap adaptif, mudah dibaca, dan tidak mengalami *technical debt* yang menumpuk akibat iterasi AI yang cepat.

## 1. Aturan Utama (Core Principles)

* **SOLID & DRY:** Terapkan prinsip pemrograman berorientasi objek/fungsional yang bersih. Hindari duplikasi logika yang dihasilkan oleh beberapa iterasi *prompting* sebelumnya.
* **Pembersihan Agresif:** Hapus *dead code*, fungsi eksperimental yang tidak lagi dipanggil, *unused imports*, serta komentar `// TODO` atau sisa instruksi LLM kuno.
* **Fungsionalitas Sakral:** Selalu pertahankan integritas fungsionalitas utama. Pemfaktoran ulang hanya mengubah *bagaimana* kode bekerja di dalam, bukan *apa* yang dihasilkan (lakukan *regression check*).
* **Stabilitas Kontrak & API:** Jangan merusak dokumentasi API, skema basis data, atau struktur *router* yang sudah disepakati dan digunakan oleh modul lain.

## 2. Aturan Khusus Vibe Coding (AI-Assisted Rules)

* **Konteks Maksimal, Token Minimal:** Faktorkan ulang kode agar lebih modular dan terpisah ke dalam berkas-berkas kecil (*micro-modules*). Ini membantu meminimalkan penggunaan *context window* token pada iterasi *vibe coding* berikutnya.
* **Standarisasi Pola (Pattern Alignment):** Jika AI sebelumnya menulis kode menggunakan pola `async/await`, pastikan seluruh modul menggunakan pola yang sama (hindari percampuran dengan `Promises.then()` tradisional dalam satu berkas).
* **Komentar Niat (Intentional Commenting):** Ganti komentar penjelasan baris-per-baris yang sepele dengan komentar dokumentasi tingkat tinggi (seperti JSDoc/Docstring) yang menjelaskan *mengapa* fungsi tersebut ada, guna membantu pemahaman LLM lain di masa depan.
* **Koreksi Tipe Kuat (Type Safety):** Ubah tipe data implisit atau tipe longgar (seperti `any` pada TypeScript) menjadi *strongly-typed interface* atau *generic* untuk meminimalkan *bug* logis saat agen AI melakukan modifikasi berikutnya.

## 3. Alur Kerja Refactoring (Workflow Steps)

1. **Analisis & Pemetaan:** Identifikasi *code smells* (misal: fungsi terlalu panjang, *nested if-else* yang terlalu dalam, atau *state management* yang berantakan).
2. **Isolasi Dampak:** Pastikan komponen yang akan diubah memiliki batasan (*boundary*) yang jelas agar tidak memicu efek domino (*breaking changes*) pada modul lain.
3. **Eksekusi Bertahap:** Lakukan perubahan secara inkremental (bertahap). Jangan merombak seluruh arsitektur aplikasi dalam satu kali eksekusi *prompt*.
4. **Verifikasi & Validasi:** Tampilkan perbandingan *Before vs After* dalam bentuk blok kode yang ringkas dan jelaskan peningkatan efisiensi yang didapatkan (misalnya penurunan kompleksitas waktu $O(n^2)$ menjadi $O(n)$).
