package handlers

import (
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm/clause"
)

func GetGameReviews(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")
	entryID := c.Params("eid")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	var reviews []models.GameReview
	if err := database.DB.Where("game_entry_id = ?", entryID).Preload("User").Order("updated_at desc").Find(&reviews).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch reviews"})
	}

	return c.JSON(reviews)
}

func SubmitGameReview(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")
	entryID := c.Params("eid")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	// Verify entry belongs to the list
	var entry models.GameEntry
	if err := database.DB.Where("id = ? AND game_list_id = ?", entryID, listID).First(&entry).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Game entry not found in this list"})
	}

	// Parse input
	var input struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	if input.Rating < 1 || input.Rating > 5 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Rating must be between 1 and 5"})
	}

	// Upsert review
	review := models.GameReview{
		GameEntryID: entry.ID,
		UserID:      userID,
		Rating:      input.Rating,
		Comment:     input.Comment,
	}

	// GORM Clause OnConflict to upsert based on (game_entry_id, user_id)
	err = database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "game_entry_id"}, {Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"rating", "comment", "updated_at"}),
	}).Create(&review).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save review"})
	}

	// Fetch saved review with preloaded User
	database.DB.Preload("User").First(&review, review.ID)

	return c.JSON(review)
}
