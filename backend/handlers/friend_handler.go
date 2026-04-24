package handlers

import (
	"fmt"
	"strconv"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
)

type AddFriendInput struct {
	Username string `json:"username"`
}

type FriendWithPresence struct {
	models.TrackedFriend
	CurrentStatus string  `json:"current_status"`
	CurrentGame   *string `json:"current_game"`
}

func GetFriends(c *fiber.Ctx) error {
	var friends []models.TrackedFriend
	// Optimized DB selection memory-wise as per PRD
	if err := database.DB.Select("id", "roblox_user_id", "roblox_username", "last_status", "last_played_game", "presence_location").Find(&friends).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	var userIds []uint
	for _, f := range friends {
		uid, _ := strconv.ParseUint(f.RobloxUserID, 10, 64)
		userIds = append(userIds, uint(uid))
	}

	presences, err := services.GetUsersPresence(userIds)
	if err != nil {
		// Just log error, don't fail, fallback to DB last status
		fmt.Printf("Error fetching presence: %v\n", err)
	}

	presenceMap := make(map[uint]services.PresenceData)
	for _, p := range presences {
		presenceMap[p.UserId] = p
	}

	var results []FriendWithPresence
	for _, f := range friends {
		uid, _ := strconv.ParseUint(f.RobloxUserID, 10, 64)
		p, exists := presenceMap[uint(uid)]
		
		statusStr := f.LastStatus
		var game *string

		if exists {
			s, ok := services.PresenceTypeMap[p.UserPresenceType]
			if ok {
				statusStr = s
			}
			if p.UserPresenceType == 2 { // In-Game
				loc := p.LastLocation
				game = &loc
			}
		}

		res := FriendWithPresence{
			TrackedFriend: f,
			CurrentStatus: statusStr,
			CurrentGame:   game,
		}
		if exists && p.LastLocation != "" {
			loc := p.LastLocation
			res.TrackedFriend.PresenceLocation = &loc
		}
		results = append(results, res)
	}

	return c.JSON(results)
}

func AddFriend(c *fiber.Ctx) error {
	var input AddFriendInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	if input.Username == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Username is required"})
	}

	userId, realUsername, err := services.GetUserIdByUsername(input.Username)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Failed to find user on Roblox", "details": err.Error()})
	}

	var existing models.TrackedFriend
	uidStr := strconv.FormatUint(uint64(userId), 10)
	if database.DB.Where("roblox_user_id = ?", uidStr).First(&existing).RowsAffected > 0 {
		return c.Status(400).JSON(fiber.Map{"error": "User is already tracked"})
	}

	newFriend := models.TrackedFriend{
		RobloxUserID:   uidStr,
		RobloxUsername: realUsername,
		LastStatus:     "Offline",
	}

	if err := database.DB.Create(&newFriend).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save friend to database"})
	}

	return c.JSON(newFriend)
}

func DeleteFriend(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "ID is required"})
	}

	var friend models.TrackedFriend
	if database.DB.First(&friend, id).RowsAffected == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Friend not found"})
	}

	if err := database.DB.Delete(&friend).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete from database"})
	}

	return c.JSON(fiber.Map{"success": true})
}
