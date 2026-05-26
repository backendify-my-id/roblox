package handlers

import (
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
)

func GetUserSettings(c *fiber.Ctx) error {
	userId, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	var user models.User
	if err := database.DB.Preload("StealthExempts").First(&user, userId).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	// Buat daftar user yang dikecualikan
	type ExemptUser struct {
		ID       uint   `json:"id"`
		Username string `json:"username"`
		Avatar   string `json:"avatar_url"`
	}
	var exempts []ExemptUser
	for _, eu := range user.StealthExempts {
		exempts = append(exempts, ExemptUser{
			ID:       eu.ID,
			Username: eu.RobloxUsername,
			Avatar:   eu.AvatarURL,
		})
	}

	return c.JSON(fiber.Map{
		"is_stealth": user.IsStealth,
		"exempts":    exempts,
		"role":       c.Locals("role"),
	})
}

func UpdateStealthMode(c *fiber.Ctx) error {
	role := c.Locals("role").(string)
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Hanya Admin yang dapat menggunakan fitur ini"})
	}

	type Request struct {
		IsStealth bool `json:"is_stealth"`
	}
	req := new(Request)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	wasStealth := user.IsStealth

	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Update("is_stealth", req.IsStealth).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal memperbarui pengaturan"})
	}

	// Jika mode siluman diaktifkan, buat log fake offline agar non-exempt user melihatnya
	if req.IsStealth && !wasStealth {
		fakeLog := models.ActivityLog{
			UserID:    userID,
			Status:    "Stealth Offline",
			GameName:  "-",
			IsStealth: true,
		}
		database.DB.Create(&fakeLog)
	}

	// Kirim broadcast WebSocket real-time ke semua pelacak agar perubahan status langsung termuat di layar mereka
	services.Hub.Broadcast(services.WSMessage{
		Type:   "presence_update",
		UserID: userID,
	})

	return c.JSON(fiber.Map{"message": "Mode Siluman diperbarui", "is_stealth": req.IsStealth})
}

func AddStealthExemption(c *fiber.Ctx) error {
	role := c.Locals("role").(string)
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Hanya Admin yang dapat menggunakan fitur ini"})
	}

	type Request struct {
		Username string `json:"username"`
	}
	req := new(Request)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Cari user target
	var targetUser models.User
	if err := database.DB.Where("roblox_username ILIKE ?", req.Username).First(&targetUser).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pengguna tidak ditemukan di database"})
	}

	// Validasi 1: Pastikan admin tidak menambahkan dirinya sendiri
	if targetUser.ID == userID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Anda tidak bisa menambahkan diri sendiri ke daftar pengecualian"})
	}

	// Validasi 2: Pastikan pengguna belum ada di daftar pengecualian admin (mencegah duplikasi & error PostgreSQL)
	var count int64
	database.DB.Table("stealth_exemptions").
		Where("user_id = ? AND exempt_id = ?", userID, targetUser.ID).
		Count(&count)
	if count > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Pengguna sudah ada dalam daftar pengecualian"})
	}

	// Tambahkan ke relasi
	var admin models.User
	database.DB.First(&admin, userID)
	
	if err := database.DB.Model(&admin).Association("StealthExempts").Append(&targetUser); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal menambahkan pengecualian"})
	}

	// Kirim broadcast WebSocket agar status asli admin langsung terlihat oleh user yang baru saja dikecualikan
	services.Hub.Broadcast(services.WSMessage{
		Type:   "presence_update",
		UserID: userID,
	})

	return c.JSON(fiber.Map{"message": "Berhasil ditambahkan", "exempt": fiber.Map{
		"id": targetUser.ID,
		"username": targetUser.RobloxUsername,
		"avatar_url": targetUser.AvatarURL,
	}})
}

func RemoveStealthExemption(c *fiber.Ctx) error {
	role := c.Locals("role").(string)
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Hanya Admin yang dapat menggunakan fitur ini"})
	}

	targetID := c.Params("id")
	
	var admin models.User
	database.DB.First(&admin, userID)
	
	var targetUser models.User
	if err := database.DB.First(&targetUser, targetID).Error; err == nil {
		database.DB.Model(&admin).Association("StealthExempts").Delete(&targetUser)
		
		// Kirim broadcast WebSocket agar status admin kembali menjadi Offline tersembunyi untuk user tersebut
		services.Hub.Broadcast(services.WSMessage{
			Type:   "presence_update",
			UserID: userID,
		})
	}

	return c.JSON(fiber.Map{"message": "Berhasil dihapus"})
}

func GetMyActivityLogs(c *fiber.Ctx) error {
	userId, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	
	offset := c.QueryInt("offset", 0)
	limit := 100

	var logs []models.ActivityLog
	// Ambil semua log global atau log yang kita buat sendiri untuk kita
	if err := database.DB.Preload("Map").Where("user_id = ? AND (owner_id IS NULL OR owner_id = ?)", userId, userId).Order("created_at desc").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch activity logs"})
	}

	return c.JSON(logs)
}

func GetMyProfileChanges(c *fiber.Ctx) error {
	userId, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	offset := c.QueryInt("offset", 0)
	limit := 100

	var logs []models.ProfileChangeLog
	// Ambil semua log profil milik kita
	// Perubahan profil adalah valid milik kita terlepas dari siapa (owner_id) yang pertama kali menemukannya saat sync
	if err := database.DB.Where("user_id = ?", userId).Order("created_at desc").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch profile change logs"})
	}

	return c.JSON(logs)
}
