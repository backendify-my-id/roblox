package handlers

import (
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
)

// TrackFeatureUsage registers a single telemetry usage event
func TrackFeatureUsage(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	var req struct {
		FeatureName string `json:"feature_name"`
		ActionType  string `json:"action_type"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.FeatureName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "feature_name is required"})
	}

	if req.ActionType == "" {
		req.ActionType = "view"
	}

	usage := models.FeatureUsage{
		UserID:      userID,
		FeatureName: req.FeatureName,
		ActionType:  req.ActionType,
	}

	if err := database.DB.Create(&usage).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save telemetry data"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "Telemetry tracked successfully"})
}

// GetTelemetryStats retrieves aggregated feature usage statistics for the user
func GetTelemetryStats(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	// 1. Get total interaction count
	var totalInteractions int64
	if err := database.DB.Model(&models.FeatureUsage{}).Where("user_id = ?", userID).Count(&totalInteractions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch telemetry total count"})
	}

	// 2. Get top features count
	type TopFeatureItem struct {
		FeatureName string `json:"feature_name"`
		Count       int64  `json:"count"`
		Percentage  int    `json:"percentage"`
	}

	var rawTopItems []struct {
		FeatureName string
		Count       int64
	}

	if err := database.DB.Model(&models.FeatureUsage{}).
		Select("feature_name, count(*) as count").
		Where("user_id = ?", userID).
		Group("feature_name").
		Order("count DESC").
		Limit(10).
		Scan(&rawTopItems).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch top features"})
	}

	topFeatures := make([]TopFeatureItem, 0)
	for _, item := range rawTopItems {
		pct := 0
		if totalInteractions > 0 {
			pct = int((item.Count * 100) / totalInteractions)
		}
		topFeatures = append(topFeatures, TopFeatureItem{
			FeatureName: item.FeatureName,
			Count:       item.Count,
			Percentage:  pct,
		})
	}

	// 3. Get recent activities
	var recentActivities []models.FeatureUsage
	if err := database.DB.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(15).
		Find(&recentActivities).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch recent activities"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"total_interactions": totalInteractions,
		"top_features":       topFeatures,
		"recent_activities":  recentActivities,
	})
}
