package handlers

import (
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
)

func GetAllUsers(c *fiber.Ctx) error {
	role := c.Locals("role").(string)
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	var users []models.User
	// Preload Role and Friends to get a count or details
	if err := database.DB.Preload("Role").Preload("Friends").Order("created_at desc").Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch users"})
	}

	// Buat response custom agar lebih bersih (menghitung jumlah teman)
	type UserResponse struct {
		ID                uint      `json:"id"`
		RobloxUserID      string    `json:"roblox_user_id"`
		RobloxUsername    string    `json:"roblox_username"`
		RobloxDisplayName string    `json:"roblox_display_name"`
		AvatarURL         string    `json:"avatar_url"`
		CurrentPresence   string    `json:"current_presence"`
		CurrentGameName   string    `json:"current_game_name"`
		IsStealth         bool      `json:"is_stealth"`
		RoleName          string    `json:"role_name"`
		IsRegistered      bool      `json:"is_registered"`
		FriendsCount      int       `json:"friends_count"`
		CreatedAt         string    `json:"created_at"`
	}

	var res []UserResponse
	for _, u := range users {
		roleName := "User"
		isRegistered := false
		if u.RoleID != nil {
			roleName = u.Role.Name
			isRegistered = true
		} else {
			roleName = "Synced Friend"
		}

		res = append(res, UserResponse{
			ID:                u.ID,
			RobloxUserID:      u.RobloxUserID,
			RobloxUsername:    u.RobloxUsername,
			RobloxDisplayName: u.RobloxDisplayName,
			AvatarURL:         u.AvatarURL,
			CurrentPresence:   u.CurrentPresence,
			CurrentGameName:   u.CurrentGameName,
			IsStealth:         u.IsStealth,
			RoleName:          roleName,
			IsRegistered:      isRegistered,
			FriendsCount:      len(u.Friends),
			CreatedAt:         u.CreatedAt.Format("02/01/2006, 15:04:05"),
		})
	}

	return c.JSON(res)
}

func GetUserActivityLogs(c *fiber.Ctx) error {
	role := c.Locals("role").(string)
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	userId := c.Params("id")

	var logs []models.ActivityLog
	if err := database.DB.Where("user_id = ?", userId).Order("created_at desc").Limit(100).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch activity logs"})
	}

	return c.JSON(logs)
}

func GetUserProfileChanges(c *fiber.Ctx) error {
	role := c.Locals("role").(string)
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	userId := c.Params("id")

	var logs []models.ProfileChangeLog
	if err := database.DB.Where("user_id = ?", userId).Order("created_at desc").Limit(100).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch profile change logs"})
	}

	return c.JSON(logs)
}
