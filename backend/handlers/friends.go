package handlers

import (
	"fmt"
	"log"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
)

func GetFriends(c *fiber.Ctx) error {
	userId, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	var friends []models.Friend
	// Preload TargetUser dan StealthExempts-nya
	query := database.DB.Preload("TargetUser.StealthExempts").
		Joins("JOIN users target_user ON friends.friend_id = target_user.id").
		Where("friends.user_id = ?", userId)

	if statusFilter := c.Query("status"); statusFilter != "" {
		query = query.Where("friends.status = ?", statusFilter)
	}

	if presenceFilter := c.Query("presence"); presenceFilter != "" {
		query = query.Where("target_user.current_presence = ?", presenceFilter)
	}

	if searchFilter := c.Query("search"); searchFilter != "" {
		searchTerm := "%" + searchFilter + "%"
		query = query.Where("target_user.roblox_username ILIKE ? OR target_user.roblox_display_name ILIKE ?", searchTerm, searchTerm)
	}

	if err := query.Order(`
		CASE friends.status WHEN 'active' THEN 0 ELSE 1 END,
		CASE target_user.current_presence
			WHEN 'In-Game' THEN 0
			WHEN 'In-Studio' THEN 1
			WHEN 'Online' THEN 2
			WHEN 'Invisible' THEN 3
			WHEN 'Offline' THEN 4
			ELSE 5
		END,
		target_user.roblox_display_name ASC
	`).Find(&friends).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch friends"})
	}

	now := time.Now()
	sevenDaysAgo := now.AddDate(0, 0, -7)

	type FriendResponse struct {
		ID                uint      `json:"id"`
		FriendRobloxID    string    `json:"friend_roblox_id"`
		FriendUsername    string    `json:"friend_username"`
		FriendDisplayName string    `json:"friend_display_name"`
		AvatarURL         string    `json:"avatar_url"`
		Status            string    `json:"status"`
		CurrentPresence   string    `json:"current_presence"`
		CurrentGameName   string    `json:"current_game_name"`
		CreatedAt         time.Time `json:"created_at"`
		UpdatedAt         time.Time `json:"updated_at"`
		IsNew             bool      `json:"is_new"`
	}

	var res []FriendResponse
	for _, f := range friends {
		presence := f.TargetUser.CurrentPresence
		gameName := f.TargetUser.CurrentGameName

		// LOGIKA STEALTH: Cek apakah target sedang mode siluman
		if f.TargetUser.IsStealth {
			isExempted := false
			for _, ex := range f.TargetUser.StealthExempts {
				if ex.ID == userId {
					isExempted = true
					break
				}
			}
			// Jika user ini TIDAK dikecualikan, paksa jadi Offline
			if !isExempted {
				presence = "Offline"
				gameName = "-"
			}
		}

		res = append(res, FriendResponse{
			ID:                f.ID,
			FriendRobloxID:    f.TargetUser.RobloxUserID,
			FriendUsername:    f.TargetUser.RobloxUsername,
			FriendDisplayName: f.TargetUser.RobloxDisplayName,
			AvatarURL:         f.TargetUser.AvatarURL,
			Status:            f.Status,
			CurrentPresence:   presence,
			CurrentGameName:   gameName,
			CreatedAt:         f.CreatedAt,
			UpdatedAt:         f.UpdatedAt,
			IsNew:             f.CreatedAt.After(sevenDaysAgo) && f.Status != "removed",
		})
	}

	return c.JSON(res)
}

func ManualSync(c *fiber.Ctx) error {
	userId, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	var user models.User
	if err := database.DB.First(&user, userId).Error; err != nil {
		log.Printf("[ManualSync] User not found for id=%d: %v", userId, err)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	log.Printf("[ManualSync] Syncing friends for user %s (roblox_id=%s)", user.RobloxUsername, user.RobloxUserID)

	lockKey := fmt.Sprintf("lock:manual_sync:%d", userId)
	isLocked, _ := cache.RDB.Get(cache.Ctx, lockKey).Result()
	if isLocked != "" {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"error": "Tunggu sebentar, Anda baru saja melakukan sinkronisasi. Coba lagi dalam 2 menit.",
		})
	}

	if err := services.SyncUserFriends(user.ID, user.RobloxUserID, true); err != nil {
		log.Printf("[ManualSync] Sync error for user %s: %v", user.RobloxUsername, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to sync friends: " + err.Error()})
	}

	cache.RDB.Set(cache.Ctx, lockKey, "locked", 2*time.Minute)

	return c.JSON(fiber.Map{"message": "Sync successful"})
}

func GetActivityLogs(c *fiber.Ctx) error {
	userId, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	friendId := c.Params("friendId")

	var friend models.Friend
	// Preload TargetUser and StealthExempts
	if err := database.DB.Preload("TargetUser.StealthExempts").First(&friend, friendId).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Friend not found"})
	}

	// Cek apakah target sedang mode siluman
	isStealth := friend.TargetUser.IsStealth
	isExempted := false
	if isStealth {
		for _, ex := range friend.TargetUser.StealthExempts {
			if ex.ID == userId {
				isExempted = true
				break
			}
		}
	}

	var logs []models.ActivityLog
	
	// 1. Cari waktu "First Added" milik user ini untuk teman ini
	var firstAddedLog models.ActivityLog
	database.DB.Where("user_id = ? AND owner_id = ? AND status = ?", friend.FriendID, userId, "First Added").
		Order("created_at asc").First(&firstAddedLog)

	query := database.DB.Where("user_id = ? AND (owner_id IS NULL OR owner_id = ?)", friend.FriendID, userId)

	// 2. Jika ditemukan log "First Added", sembunyikan semua log (global/privat) sebelum waktu tersebut
	if firstAddedLog.ID > 0 {
		query = query.Where("created_at >= ?", firstAddedLog.CreatedAt)
	}

	if !isExempted {
		// Non-exempt user: Sembunyikan semua log yang dibuat saat mode siluman aktif, 
		// KECUALI log palsu "Stealth Offline" yang dibuat saat admin menyalakan mode siluman.
		query = query.Where("is_stealth = ? OR status = ?", false, "Stealth Offline")
	} else {
		// Exempt user: Lihat semua status asli. Sembunyikan log palsu "Stealth Offline".
		query = query.Where("status != ?", "Stealth Offline")
	}

	if err := query.Order("created_at desc").Limit(50).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch activity logs"})
	}

	// Ubah teks "Stealth Offline" menjadi "Offline" biasa sebelum dikirim ke frontend
	for i := range logs {
		if logs[i].Status == "Stealth Offline" {
			logs[i].Status = "Offline"
		}
	}

	return c.JSON(logs)
}

func GetProfileChangeLogs(c *fiber.Ctx) error {
	userId, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	friendId := c.Params("friendId")

	var friend models.Friend
	if err := database.DB.First(&friend, friendId).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Friend not found"})
	}

	var logs []models.ProfileChangeLog
	// Log perubahan profil sekarang bersifat privat per pelacak
	if err := database.DB.Where("user_id = ? AND owner_id = ?", friend.FriendID, userId).Order("created_at desc").Limit(50).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch profile change logs"})
	}

	return c.JSON(logs)
}
