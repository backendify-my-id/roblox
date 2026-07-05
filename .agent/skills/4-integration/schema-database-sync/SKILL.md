---
name: "schema-database-sync"
description: "Picu skill ini jika user meminta memodifikasi skema GORM, menulis query SQL, membuat migration file, atau sinkronisasi DB-Redis."
---

# Schema Database Sync Skill

Skill ini mengatur sinkronisasi dan keamanan data pada relasi PostgreSQL dan Redis.

## Aturan Utama:
1. Pastikan setiap model GORM baru memiliki tag DB yang tepat (`gorm:"uniqueIndex"`, `gorm:"primaryKey"`).
2. Data yang sering dibaca (seperti API Keys atau detail sesi) wajib di-cache di Redis dengan mekanisme sinkronisasi dua-arah otomatis saat data DB berubah.
3. Selalu jalankan migrasi database di dalam transaksi aman (`db.Transaction`).
