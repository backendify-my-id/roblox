---
name: "clean-arch-architect"
description: "Picu skill ini jika mendesain arsitektur modul Go, domain layer, interface, atau restrukturisasi sistem backend."
---

# Clean Arch Architect Skill

Skill ini mengawasi kepatuhan kode terhadap asas-asas Clean Architecture, khususnya di ekosistem Go.

## Aturan Utama:
1. Pisahkan kode menjadi 4 layer utama: Domain (Entities/Interfaces), Usecase (Business Logic), Repository (Database Access), dan Delivery/Handler (HTTP/gRPC Router).
2. Layer terdalam (Domain) tidak boleh mengimpor library luar atau bergantung pada layer luar.
3. Selalu gunakan Dependency Injection untuk menghubungkan antar layer.
