package handlers

import (
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
)

func UpdateStealthMode(c *fiber.Ctx) error {
	// Get user info from context
	role := c.Locals("role").(string)
	userID := uint(c.Locals("user_id").(float64))
	
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

	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Select("is_stealth").Updates(map[string]interface{}{"is_stealth": req.IsStealth}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal memperbarui pengaturan"})
	}

	return c.JSON(fiber.Map{"message": "Pengaturan diperbarui", "is_stealth": req.IsStealth})
}
