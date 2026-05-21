package handlers

import (
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
	"time"
)

// Helper to verify user is a member of the list
func verifyListMembership(c *fiber.Ctx, listID string, userID uint) error {
	var member models.GameListMember
	if err := database.DB.Where("game_list_id = ? AND user_id = ?", listID, userID).First(&member).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are not a member of this list"})
	}
	return nil
}

func GetGameEntries(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	var entries []models.GameEntry
	if err := database.DB.
		Where("game_list_id = ?", listID).
		Preload("AddedBy").
		Preload("Media").
		Find(&entries).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch game entries"})
	}

	return c.JSON(entries)
}

func CreateGameEntry(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		RobloxLink  string `json:"roblox_link"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	if input.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name is required"})
	}

	var list models.GameList
	if err := database.DB.First(&list, listID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "List not found"})
	}

	entry := models.GameEntry{
		GameListID:  list.ID,
		AddedByID:   userID,
		Name:        input.Name,
		Description: input.Description,
		RobloxLink:  input.RobloxLink,
		Status:      "to_play",
	}

	if err := database.DB.Create(&entry).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create game entry"})
	}

	// Fetch with AddedBy for return
	database.DB.Preload("AddedBy").First(&entry, entry.ID)

	return c.Status(fiber.StatusCreated).JSON(entry)
}

func UpdateGameEntry(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")
	entryID := c.Params("eid")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	var entry models.GameEntry
	if err := database.DB.Where("id = ? AND game_list_id = ?", entryID, listID).First(&entry).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Entry not found in this list"})
	}

	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		RobloxLink  string `json:"roblox_link"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	if input.Name != "" {
		entry.Name = input.Name
	}
	entry.Description = input.Description
	entry.RobloxLink = input.RobloxLink

	if err := database.DB.Save(&entry).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update game entry"})
	}

	return c.JSON(entry)
}

func DeleteGameEntry(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")
	entryID := c.Params("eid")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	var entry models.GameEntry
	if err := database.DB.Where("id = ? AND game_list_id = ?", entryID, listID).First(&entry).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Entry not found in this list"})
	}

	// Ideally we delete associated media files from disk here too before DB deletion
	database.DB.Where("game_entry_id = ?", entryID).Delete(&models.GameMedia{})

	if err := database.DB.Delete(&entry).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete game entry"})
	}

	return c.JSON(fiber.Map{"message": "Game entry deleted successfully"})
}

func ToggleGameEntryStatus(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")
	entryID := c.Params("eid")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	var entry models.GameEntry
	if err := database.DB.Where("id = ? AND game_list_id = ?", entryID, listID).First(&entry).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Entry not found in this list"})
	}

	var input struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	if input.Status != "to_play" && input.Status != "played" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Status must be 'to_play' or 'played'"})
	}

	entry.Status = input.Status
	if input.Status == "played" {
		now := time.Now()
		entry.PlayedAt = &now
	} else {
		entry.PlayedAt = nil
	}

	if err := database.DB.Save(&entry).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update game entry status"})
	}

	return c.JSON(entry)
}
