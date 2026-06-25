package handlers

import (
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/apany/roblox-friend-tracker/utils"
	"github.com/gofiber/fiber/v2"
	"time"
)

func GetRobloxMaps(c *fiber.Ctx) error {
	search := c.Query("search")
	var maps []models.RobloxMap

	db := database.DB
	if search != "" {
		db = db.Where("name ILIKE ?", "%"+search+"%")
	}

	if err := db.Order("name asc").Find(&maps).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch maps"})
	}

	return c.JSON(maps)
}

func CreateRobloxMap(c *fiber.Ctx) error {
	var input struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	if input.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name is required"})
	}

	var existing models.RobloxMap
	if err := database.DB.Where("name = ?", input.Name).First(&existing).Error; err == nil {
		// Map already exists, return it
		return c.JSON(existing)
	}

	newMap := models.RobloxMap{
		Name:      input.Name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := database.DB.Create(&newMap).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create map"})
	}

	return c.Status(fiber.StatusCreated).JSON(newMap)
}

func SearchRobloxGamesOnline(c *fiber.Ctx) error {
	query := c.Query("query")
	if query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Query parameter is required"})
	}

	userID, err := getUserID(c)
	var decryptedCookie string
	if err == nil {
		var user models.User
		if err := database.DB.First(&user, userID).Error; err == nil && user.RobloxCookie != "" {
			if dec, decErr := utils.Decrypt(user.RobloxCookie); decErr == nil {
				decryptedCookie = dec
			}
		}
	}

	results, err := services.SearchRobloxGames(query, decryptedCookie)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(results)
}
