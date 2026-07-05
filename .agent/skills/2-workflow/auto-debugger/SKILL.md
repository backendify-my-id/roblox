---
name: "auto-debugger"
description: "Picu skill ini ketika terjadi error kompilasi, test failure, port conflict, atau exception logs pada sistem."
---

# Auto Debugger Skill

Skill ini bertugas membimbing penanganan error dan bug aplikasi.

## Aturan Utama:
1. Analisis pesan error secara runtut: identifikasi baris kode yang rusak, jenis Exception, dan dependensi terkait.
2. Cari solusi terdekat di dalam dokumen knowledge base (KI) atau issues serupa.
3. Selalu buat tes skenario mini untuk memvalidasi apakah perbaikan sudah benar-benar menyelesaikan masalah tanpa merusak fitur lain.
