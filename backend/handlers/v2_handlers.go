package handlers

import (
	"log"
	"strconv"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
)

type V2FriendWithPresence struct {
	models.Friend
	CurrentStatus string  `json:"current_status"`
	CurrentGame   *string `json:"current_game"`
	IsNewFriend   bool    `json:"is_new_friend"`
}

type TargetWithFriendCount struct {
	models.User
	FriendCount int64 `json:"friend_count"`
}

// GET /api/v2/targets
// Returns all tracked target users from DB (no Roblox API call)
func GetAllTargets(c *fiber.Ctx) error {
	var users []models.User
	if err := database.DB.Find(&users).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch targets"})
	}

	var results []TargetWithFriendCount
	for _, u := range users {
		var count int64
		database.DB.Model(&models.Friend{}).Where("user_id = ? AND is_deleted = false", u.ID).Count(&count)
		results = append(results, TargetWithFriendCount{User: u, FriendCount: count})
	}

	return c.JSON(results)
}

// POST /api/v2/targets
// Adds (or re-syncs) a target by username. Calls Roblox API to fetch friends.
// If already exists in DB and synced recently (< 5 min), skips full sync.
func AddOrSyncTarget(c *fiber.Ctx) error {
	type Req struct {
		Username string `json:"username"`
	}
	var body Req
	if err := c.BodyParser(&body); err != nil || body.Username == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Username is required"})
	}

	// Resolve Roblox user ID
	userId, realUsername, err := services.GetUserIdByUsername(body.Username)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "User not found on Roblox"})
	}
	uidStr := strconv.FormatUint(uint64(userId), 10)

	// Check if already in DB
	var user models.User
	isNew := database.DB.Where("roblox_user_id = ?", uidStr).First(&user).Error != nil

	if isNew {
		// Brand new target — create record first
		user = models.User{
			RobloxUserID:   uidStr,
			RobloxUsername: realUsername,
		}
		if err := database.DB.Create(&user).Error; err != nil {
			log.Printf("[ERROR] Create user failed: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "Failed to create user record"})
		}
	} else {
		// Already exists — check if recently synced (< 5 minutes)
		if time.Since(user.LastSynced) < 5*time.Minute {
			// Return early with current DB data, skip full Roblox sync
			var count int64
			database.DB.Model(&models.Friend{}).Where("user_id = ? AND is_deleted = false", user.ID).Count(&count)
			return c.JSON(fiber.Map{
				"target_user":  user,
				"friend_count": count,
				"synced":       false,
				"message":      "Recently synced, serving from database",
			})
		}
	}

	uidUint := uint(userId) // safe cast for API calls (thumbnails/details accept []uint)

	// === Full Roblox Sync ===

	// Fetch target's own avatar (always update, not just when empty)
	targetAvatars, _ := services.GetAvatarThumbnails([]uint{uidUint})
	if url, ok := targetAvatars[uidUint]; ok {
		user.AvatarURL = url
	}

	// Fetch displayName for the target user (always update)
	targetDetails, _ := services.GetUserDetails([]uint{uidUint})
	if detail, ok := targetDetails[uidUint]; ok {
		user.RobloxUsername = detail.Name
		user.RobloxDisplayName = detail.DisplayName
	}

	// Fetch friends list (IDs only)
	log.Printf("[SYNC] Fetching friends for user %s", uidStr)
	friendIds, err := services.GetFriendsForUser(uidStr)
	if err != nil {
		log.Printf("[ERROR] GetFriendsForUser failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch friends from Roblox"})
	}
	log.Printf("[SYNC] Found %d friends", len(friendIds))

	// Resolve full names + displayNames for all friends
	userDetails, _ := services.GetUserDetails(friendIds)

	// Fetch existing friends from DB
	var dbFriends []models.Friend
	database.DB.Where("user_id = ?", user.ID).Find(&dbFriends)

	dbFriendMap := make(map[string]models.Friend)
	for _, df := range dbFriends {
		dbFriendMap[df.FriendRobloxID] = df
	}

	apiFriendSet := make(map[string]bool)

	// Process active/new friends
	for _, fId := range friendIds {
		fIdStr := strconv.FormatUint(uint64(fId), 10)
		apiFriendSet[fIdStr] = true

		detail := userDetails[fId]
		uname := detail.Name
		dname := detail.DisplayName
		if uname == "" {
			uname = fIdStr
		}
		if dname == "" {
			dname = uname
		}

		if existing, ok := dbFriendMap[fIdStr]; ok {
			needsSave := false
			if existing.IsDeleted {
				existing.IsDeleted = false
				needsSave = true
			}
			if existing.FriendUsername != uname || existing.FriendDisplayName != dname {
				existing.FriendUsername = uname
				existing.FriendDisplayName = dname
				needsSave = true
			}
			if needsSave {
				database.DB.Save(&existing)
			}
		} else {
			nf := models.Friend{
				UserID:            user.ID,
				FriendRobloxID:    fIdStr,
				FriendUsername:    uname,
				FriendDisplayName: dname,
			}
			database.DB.Create(&nf)
		}
	}

	// Mark unfriended as deleted
	for _, df := range dbFriends {
		if !apiFriendSet[df.FriendRobloxID] && !df.IsDeleted {
			df.IsDeleted = true
			database.DB.Save(&df)
		}
	}

	// Fetch missing thumbnails for friends
	database.DB.Where("user_id = ?", user.ID).Find(&dbFriends)
	var missingThumbs []uint
	for _, df := range dbFriends {
		if df.AvatarURL == "" {
			fid, _ := strconv.ParseUint(df.FriendRobloxID, 10, 64)
			missingThumbs = append(missingThumbs, uint(fid))
		}
	}
	if len(missingThumbs) > 0 {
		thumbs, _ := services.GetAvatarThumbnails(missingThumbs)
		for i, df := range dbFriends {
			fid, _ := strconv.ParseUint(df.FriendRobloxID, 10, 64)
			if tUrl, ok := thumbs[uint(fid)]; ok {
				dbFriends[i].AvatarURL = tUrl
				database.DB.Save(&dbFriends[i])
			}
		}
	}

	// Persist updated user info
	user.LastSynced = time.Now()
	database.DB.Save(&user)

	var count int64
	database.DB.Model(&models.Friend{}).Where("user_id = ? AND is_deleted = false", user.ID).Count(&count)

	return c.JSON(fiber.Map{
		"target_user":  user,
		"friend_count": count,
		"synced":       true,
	})
}

// GET /api/v2/targets/:id/friends
// Returns friends of a specific target with live presence. Serves from DB + live API.
func GetTargetFriends(c *fiber.Ctx) error {
	targetId := c.Params("id")
	if targetId == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Target ID is required"})
	}

	var user models.User
	if err := database.DB.First(&user, targetId).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Target not found"})
	}

	var dbFriends []models.Friend
	database.DB.Where("user_id = ?", user.ID).Find(&dbFriends)

	// Collect all roblox IDs for presence fetch
	var allRobloxIds []uint
	for _, df := range dbFriends {
		fid, _ := strconv.ParseUint(df.FriendRobloxID, 10, 64)
		allRobloxIds = append(allRobloxIds, uint(fid))
	}

	// Fetch live presence
	presences, _ := services.GetUsersPresence(allRobloxIds)
	presenceMap := make(map[uint]services.PresenceData)
	for _, p := range presences {
		presenceMap[p.UserId] = p
	}

	now := time.Now()
	var results []V2FriendWithPresence

	for _, df := range dbFriends {
		fid, _ := strconv.ParseUint(df.FriendRobloxID, 10, 64)
		p, exists := presenceMap[uint(fid)]

		statusStr := "Offline"
		var gameName *string

		// Fallback: last known status from activity_logs
		var lastLog models.ActivityLog
		if err := database.DB.Where("friend_id = ?", df.ID).Order("created_at desc").First(&lastLog).Error; err == nil {
			statusStr = lastLog.Status
			gameName = lastLog.GameName
		}

		if exists {
			if s, ok := services.PresenceTypeMap[p.UserPresenceType]; ok {
				statusStr = s
			}
			if p.UserPresenceType == 2 && p.LastLocation != "" {
				loc := p.LastLocation
				gameName = &loc
			}
		}

		isNewFriend := !df.IsDeleted && now.Sub(df.CreatedAt) < 7*24*time.Hour

		results = append(results, V2FriendWithPresence{
			Friend:        df,
			CurrentStatus: statusStr,
			CurrentGame:   gameName,
			IsNewFriend:   isNewFriend,
		})
	}

	return c.JSON(fiber.Map{
		"target_user": user,
		"friends":     results,
	})
}

// GET /api/v2/friends/:friendId/logs
func GetActivityLogs(c *fiber.Ctx) error {
	friendIdParam := c.Params("friendId")
	if friendIdParam == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Friend ID is required"})
	}

	var logs []models.ActivityLog
	if err := database.DB.Where("friend_id = ?", friendIdParam).Order("created_at desc").Limit(100).Find(&logs).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch logs"})
	}

	return c.JSON(logs)
}

// DELETE /api/v2/targets/:id
// Removes a target user and all associated data (friends and activity logs)
func DeleteTarget(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Target ID is required"})
	}

	// Start a transaction to ensure all related data is deleted safely
	tx := database.DB.Begin()

	// 1. Find all friends of this user to delete their logs
	var friends []models.Friend
	if err := tx.Where("user_id = ?", id).Find(&friends).Error; err != nil {
		tx.Rollback()
		return c.Status(500).JSON(fiber.Map{"error": "Failed to find friends for deletion"})
	}

	friendIds := make([]uint, len(friends))
	for i, f := range friends {
		friendIds[i] = f.ID
	}

	// 2. Delete activity logs for these friends
	if len(friendIds) > 0 {
		if err := tx.Where("friend_id IN ?", friendIds).Delete(&models.ActivityLog{}).Error; err != nil {
			tx.Rollback()
			return c.Status(500).JSON(fiber.Map{"error": "Failed to delete activity logs"})
		}
	}

	// 3. Delete friends
	if err := tx.Where("user_id = ?", id).Delete(&models.Friend{}).Error; err != nil {
		tx.Rollback()
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete friends"})
	}

	// 4. Delete the user
	if err := tx.Delete(&models.User{}, id).Error; err != nil {
		tx.Rollback()
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete target user"})
	}

	tx.Commit()
	return c.JSON(fiber.Map{"message": "Target user and all associated data deleted successfully"})
}

