package handlers

import (
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
)

func GetUserSettings(c *fiber.Ctx) error {
	userId, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	var user models.User
	if err := database.DB.First(&user, userId).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	return c.JSON(fiber.Map{
		"is_stealth": user.IsStealth,
		"role":       c.Locals("role"),
	})
}

func UpdateStealthMode(c *fiber.Ctx) error {
	// Get user info from context
	role := c.Locals("role").(string)
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	
	// Check if admin
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

	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Update("is_stealth", req.IsStealth).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal memperbarui pengaturan"})
	}

	return c.JSON(fiber.Map{"message": "Mode Siluman diperbarui", "is_stealth": req.IsStealth})
}
