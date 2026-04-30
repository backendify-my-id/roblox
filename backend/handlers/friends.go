package handlers

import (
	"log"
	"time"

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
	query := database.DB.Where("user_id = ?", userId)

	// Filter by status: ?status=active or ?status=removed
	if statusFilter := c.Query("status"); statusFilter != "" {
		query = query.Where("status = ?", statusFilter)
	}

	// Filter by presence: ?presence=In-Game or ?presence=Online
	if presenceFilter := c.Query("presence"); presenceFilter != "" {
		query = query.Where("current_presence = ?", presenceFilter)
	}

	if err := query.Order(`
		CASE status WHEN 'active' THEN 0 ELSE 1 END,
		CASE current_presence
			WHEN 'In-Game' THEN 0
			WHEN 'In-Studio' THEN 1
			WHEN 'Online' THEN 2
			WHEN 'Invisible' THEN 3
			WHEN 'Offline' THEN 4
			ELSE 5
		END,
		friend_display_name ASC
	`).Find(&friends).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch friends"})
	}

	// Compute "Baru" tag (within last 7 days)
	now := time.Now()
	sevenDaysAgo := now.AddDate(0, 0, -7)

	type FriendResponse struct {
		models.Friend
		IsNew bool `json:"is_new"`
	}

	var res []FriendResponse
	for _, f := range friends {
		res = append(res, FriendResponse{
			Friend: f,
			IsNew:  f.CreatedAt.After(sevenDaysAgo) && f.Status != "removed",
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

	if err := services.SyncUserFriends(user.ID, user.RobloxUserID); err != nil {
		log.Printf("[ManualSync] Sync error for user %s: %v", user.RobloxUsername, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to sync friends: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Sync successful"})
}

func GetActivityLogs(c *fiber.Ctx) error {
	friendId := c.Params("friendId")

	var logs []models.ActivityLog
	if err := database.DB.Where("friend_id = ?", friendId).Order("created_at desc").Limit(50).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch activity logs"})
	}

	return c.JSON(logs)
}

func GetProfileChangeLogs(c *fiber.Ctx) error {
	friendId := c.Params("friendId")

	var logs []models.ProfileChangeLog
	if err := database.DB.Where("friend_id = ?", friendId).Order("created_at desc").Limit(50).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch profile change logs"})
	}

	return c.JSON(logs)
}
