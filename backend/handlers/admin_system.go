package handlers

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
)

func GetCronLogFiles(c *fiber.Ctx) error {
	logDir := filepath.Join(".", "uploads", "log")
	categories := []string{"startup", "http", "database", "cron", "websocket"}

	var logFiles []string
	for _, cat := range categories {
		catDir := filepath.Join(logDir, cat)
		files, err := os.ReadDir(catDir)
		if err != nil {
			continue
		}
		for _, f := range files {
			if !f.IsDir() && strings.HasSuffix(f.Name(), ".log") {
				logFiles = append(logFiles, fmt.Sprintf("%s/%s", cat, f.Name()))
			}
		}
	}

	sort.Slice(logFiles, func(i, j int) bool {
		return logFiles[i] > logFiles[j]
	})

	return c.JSON(logFiles)
}

func GetCronLogContent(c *fiber.Ctx) error {
	filePathParam := c.Params("*")

	// Validate filename to prevent path traversal
	if strings.Contains(filePathParam, "..") || strings.Contains(filePathParam, "\\") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid log filename"})
	}

	filePath := filepath.Join(".", "uploads", "log", filePathParam)
	content, err := os.ReadFile(filePath)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Log file not found or could not be read: " + err.Error()})
	}

	return c.SendString(string(content))
}

func GetAdminStats(c *fiber.Ctx) error {
	var totalUsers int64
	var registeredUsers int64
	var stealthCount int64

	database.DB.Model(&models.User{}).Count(&totalUsers)
	database.DB.Model(&models.User{}).Where("role_id IS NOT NULL").Count(&registeredUsers)
	database.DB.Model(&models.User{}).Where("is_stealth = ?", true).Count(&stealthCount)

	// Presence counts
	type PresenceCount struct {
		CurrentPresence string
		Count           int64
	}
	var presences []PresenceCount
	database.DB.Model(&models.User{}).Select("current_presence, count(*) as count").Group("current_presence").Scan(&presences)

	presenceCounts := make(map[string]int64)
	for _, p := range presences {
		presenceCounts[p.CurrentPresence] = p.Count
	}

	// Role counts (only for registered users)
	type RoleCount struct {
		Name  string
		Count int64
	}
	var roles []RoleCount
	database.DB.Model(&models.User{}).
		Select("roles.name as name, count(*) as count").
		Joins("JOIN roles ON roles.id = users.role_id").
		Group("roles.name").
		Scan(&roles)

	roleCounts := make(map[string]int64)
	for _, r := range roles {
		roleCounts[r.Name] = r.Count
	}

	// Registration Growth (using GORM Group by Month)
	type GrowthCount struct {
		Month string
		Count int64
	}
	var growth []GrowthCount
	database.DB.Model(&models.User{}).
		Select("TO_CHAR(created_at, 'YYYY-MM') as month, count(*) as count").
		Where("role_id IS NOT NULL").
		Group("TO_CHAR(created_at, 'YYYY-MM')").
		Order("TO_CHAR(created_at, 'YYYY-MM') asc").
		Scan(&growth)

	growthCounts := make(map[string]int64)
	for _, g := range growth {
		if g.Month != "" {
			growthCounts[g.Month] = g.Count
		}
	}

	return c.JSON(fiber.Map{
		"total_users":      totalUsers,
		"registered_users": registeredUsers,
		"stealth_count":    stealthCount,
		"presence_counts":  presenceCounts,
		"role_counts":      roleCounts,
		"growth_counts":    growthCounts,
	})
}

func GetFriendsNetworkGraph(c *fiber.Ctx) error {
	var dbUsers []models.User
	if err := database.DB.Preload("Role").Find(&dbUsers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal mengambil data pengguna"})
	}

	var dbFriends []models.Friend
	if err := database.DB.Where("status = ?", "active").Find(&dbFriends).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal mengambil data relasi pertemanan"})
	}

	type Node struct {
		ID          string `json:"id"`
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		AvatarURL   string `json:"avatar_url"`
		Presence    string `json:"presence"`
		GameName    string `json:"game_name"`
		Role        string `json:"role"`
	}

	type Link struct {
		Source string `json:"source"`
		Target string `json:"target"`
		Type   string `json:"type"`
	}

	var nodes []Node
	for _, u := range dbUsers {
		roleName := "Friend"
		if u.RoleID != nil && u.Role.Name != "" {
			roleName = u.Role.Name
		} else if u.PasswordHash != "" {
			roleName = "User"
		}

		nodes = append(nodes, Node{
			ID:          fmt.Sprintf("%d", u.ID),
			Username:    u.RobloxUsername,
			DisplayName: u.RobloxDisplayName,
			AvatarURL:   u.AvatarURL,
			Presence:    u.CurrentPresence,
			GameName:    u.CurrentGameName,
			Role:        roleName,
		})
	}

	var links []Link
	for _, f := range dbFriends {
		links = append(links, Link{
			Source: fmt.Sprintf("%d", f.UserID),
			Target: fmt.Sprintf("%d", f.FriendID),
			Type:   "friendship",
		})
	}

	return c.JSON(fiber.Map{
		"nodes": nodes,
		"links": links,
	})
}

func GetCronStatus(c *fiber.Ctx) error {
	ctx := cache.Ctx
	rdb := cache.RDB

	if rdb == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Redis connection not active"})
	}

	// 1. Get Roblox Rate Limit status
	remainingHits := services.GetRemainingHits()

	// 2. Fetch keys for cron metadata
	keys, err := rdb.Keys(ctx, "cron_metadata:*").Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch cron status keys"})
	}

	type JobMetadata struct {
		JobName        string `json:"job_name"`
		InstanceID     int    `json:"instance_id"`
		Status         string `json:"status"`
		StartTime      string `json:"start_time"`
		LastRun        string `json:"last_run"`
		DurationMs     int64  `json:"duration_ms"`
		ProcessedCount int    `json:"processed_count"`
		FailedCount    int    `json:"failed_count"`
		ChangeCount    int    `json:"change_count"`
	}

	var jobs []JobMetadata
	for _, key := range keys {
		data, err := rdb.HGetAll(ctx, key).Result()
		if err != nil {
			continue
		}

		instID, _ := strconv.Atoi(data["instance_id"])
		durMs, _ := strconv.ParseInt(data["duration_ms"], 10, 64)
		procCount, _ := strconv.Atoi(data["processed_count"])
		failCount, _ := strconv.Atoi(data["failed_count"])
		changeCount, _ := strconv.Atoi(data["change_count"])

		jobs = append(jobs, JobMetadata{
			JobName:        data["job_name"],
			InstanceID:     instID,
			Status:         data["status"],
			StartTime:      data["start_time"],
			LastRun:        data["last_run"],
			DurationMs:     durMs,
			ProcessedCount: procCount,
			FailedCount:    failCount,
			ChangeCount:    changeCount,
		})
	}

	// Read instance configuration dynamically from cache
	instanceID, totalInstances := cache.GetClusterConfig()

	return c.JSON(fiber.Map{
		"remaining_hits":  remainingHits,
		"max_hits":        80,
		"instance_id":     instanceID,
		"total_instances": totalInstances,
		"jobs":            jobs,
	})
}
