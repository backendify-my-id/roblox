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
	query := database.DB.Preload("TargetUser").
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
		res = append(res, FriendResponse{
			ID:                f.ID,
			FriendRobloxID:    f.TargetUser.RobloxUserID,
			FriendUsername:    f.TargetUser.RobloxUsername,
			FriendDisplayName: f.TargetUser.RobloxDisplayName,
			AvatarURL:         f.TargetUser.AvatarURL,
			Status:            f.Status,
			CurrentPresence:   f.TargetUser.CurrentPresence,
			CurrentGameName:   f.TargetUser.CurrentGameName,
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
	if err := database.DB.First(&friend, friendId).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Friend not found"})
	}

	var logs []models.ActivityLog
	// Ambil log yang global (OwnerID NULL) ATAU log milik kita sendiri
	if err := database.DB.Where("user_id = ? AND (owner_id IS NULL OR owner_id = ?)", friend.FriendID, userId).Order("created_at desc").Limit(50).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch activity logs"})
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
