package handlers

import (
	"fmt"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/apany/roblox-friend-tracker/utils"
	"github.com/gofiber/fiber/v2"
	"time"
)

func GetRobloxMaps(c *fiber.Ctx) error {
	search := c.Query("search")
	page := c.QueryInt("page", 0)
	limit := c.QueryInt("limit", 0)

	var maps []models.RobloxMap
	db := database.DB
	if search != "" {
		db = db.Where("name ILIKE ?", "%"+search+"%")
	}

	if page > 0 && limit > 0 {
		var total int64
		countDb := database.DB.Model(&models.RobloxMap{})
		if search != "" {
			countDb = countDb.Where("name ILIKE ?", "%"+search+"%")
		}
		countDb.Count(&total)

		offset := (page - 1) * limit
		if err := db.Order("name asc").Offset(offset).Limit(limit).Find(&maps).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch maps"})
		}

		totalPages := int(total) / limit
		if int(total)%limit != 0 {
			totalPages++
		}

		return c.JSON(fiber.Map{
			"data":        maps,
			"total_pages": totalPages,
			"total_items": total,
		})
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

func DeleteRobloxMap(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID is required"})
	}

	if err := database.DB.Delete(&models.RobloxMap{}, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete map: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Map deleted successfully"})
}

func SyncRobloxMapNames(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	var maps []models.RobloxMap
	if err := database.DB.Where("universe_id IS NOT NULL AND universe_id > 0").Find(&maps).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch maps: " + err.Error()})
	}

	totalProcessed := len(maps)
	totalUpdated := 0
	chunkSize := 50

	for i := 0; i < len(maps); i += chunkSize {
		end := i + chunkSize
		if end > len(maps) {
			end = len(maps)
		}

		chunk := maps[i:end]
		var universeIDs []uint64
		for _, m := range chunk {
			if m.UniverseID != nil {
				universeIDs = append(universeIDs, *m.UniverseID)
			}
		}

		if len(universeIDs) == 0 {
			continue
		}

		// Fetch batch details from Roblox API
		detailsMap, err := services.GetUniverseDetailsBatch(universeIDs)
		if err != nil {
			fmt.Printf("[SyncRobloxMapNames] API error for batch: %v\n", err)
			// Sleep and continue to try other batches
			time.Sleep(1 * time.Second)
			continue
		}

		// Update database records
		for j := range chunk {
			m := &chunk[j]
			if m.UniverseID == nil {
				continue
			}
			details, exists := detailsMap[*m.UniverseID]
			if !exists {
				continue
			}

			hasChanges := false
			if details.Name != "" && m.Name != details.Name {
				m.Name = details.Name
				hasChanges = true
			}
			if details.Description != "" && m.Description != details.Description {
				m.Description = details.Description
				hasChanges = true
			}
			if details.RootPlaceID > 0 && (m.PlaceID == nil || *m.PlaceID != details.RootPlaceID) {
				m.PlaceID = &details.RootPlaceID
				m.UrlPath = fmt.Sprintf("/games/%d/redirect", details.RootPlaceID)
				hasChanges = true
			}

			if hasChanges {
				m.UpdatedAt = time.Now()
				database.DB.Save(m)
				totalUpdated++
			}
		}

		// Sleep slightly between batches to avoid hitting Roblox rate limits
		time.Sleep(300 * time.Millisecond)
	}

	return c.JSON(fiber.Map{
		"message":         "Maps successfully synchronized to global Roblox names",
		"total_processed": totalProcessed,
		"total_updated":   totalUpdated,
	})
}

