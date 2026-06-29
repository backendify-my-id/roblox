package handlers

import (
	"fmt"
	"strings"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/apany/roblox-friend-tracker/utils"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
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
		"has_cookie": user.RobloxCookie != "",
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
	limit := c.QueryInt("limit", 100)

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

func UpdateRobloxCookie(c *fiber.Ctx) error {
	userId, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	type Request struct {
		Cookie string `json:"cookie"`
	}
	req := new(Request)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	trimmedCookie := strings.TrimSpace(req.Cookie)

	var user models.User
	if err := database.DB.First(&user, userId).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	if trimmedCookie == "" {
		// Clear user's cookie (fallback to global will be used)
		if err := database.DB.Model(&user).Update("roblox_cookie", "").Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal menghapus cookie"})
		}
		return c.JSON(fiber.Map{"message": "Cookie berhasil dihapus. Sistem akan menggunakan cookie global default."})
	}

	// Validate cookie against Roblox API
	robloxID, _, valErr := services.ValidateCookie(trimmedCookie)
	if valErr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cookie tidak valid: " + valErr.Error()})
	}

	// Double check that the cookie belongs to the registered user
	userRobloxIDStr := fmt.Sprintf("%d", robloxID)
	if user.RobloxUserID != userRobloxIDStr {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("Cookie ini milik akun Roblox dengan ID %s, sedangkan akun Anda terdaftar dengan ID %s. Cookie harus sesuai dengan akun Anda.", userRobloxIDStr, user.RobloxUserID)})
	}

	// Encrypt cookie
	encryptedCookie, encErr := utils.Encrypt(trimmedCookie)
	if encErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal mengenkripsi cookie"})
	}

	// Update DB
	if err := database.DB.Model(&user).Update("roblox_cookie", encryptedCookie).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal menyimpan cookie"})
	}

	return c.JSON(fiber.Map{"message": "Cookie Roblox berhasil disimpan dan terenkripsi"})
}

func ChangePassword(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	type Request struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}

	req := new(Request)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.CurrentPassword = strings.TrimSpace(req.CurrentPassword)
	req.NewPassword = strings.TrimSpace(req.NewPassword)

	if req.CurrentPassword == "" || req.NewPassword == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password lama dan password baru wajib diisi"})
	}

	if len(req.NewPassword) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password baru minimal harus 6 karakter"})
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User tidak ditemukan"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password lama salah"})
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal memproses password baru"})
	}

	if err := database.DB.Model(&user).Update("password_hash", string(newHash)).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal menyimpan password baru"})
	}

	return c.JSON(fiber.Map{"message": "Password berhasil diubah"})
}
