package handlers

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
)

func GetPlayingTogether(c *fiber.Ctx) error {
	scopeFriendsOnly, _ := c.Locals("scope_friends_only").(bool)
	roleName, _ := c.Locals("role").(string)

	users := make([]models.User, 0)
	query := database.DB.Preload("Role").
		Where("current_presence = ? AND current_game_name IS NOT NULL AND current_game_name != ? AND current_game_name != ?", "In-Game", "", "-")

	// Non-admin (Moderator/Observer) tidak boleh melihat user yang mode siluman aktif
	if roleName != "admin" {
		query = query.Where("is_stealth = ?", false)
	}

	if scopeFriendsOnly {
		// Hanya tampilkan teman dari user yang sedang login
		requestingUserID, err := getUserID(c)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
		}
		var friendIDs []uint
		database.DB.Model(&models.Friend{}).
			Where("user_id = ? AND status = 'active'", requestingUserID).
			Pluck("friend_id", &friendIDs)
		if len(friendIDs) == 0 {
			return c.JSON([]interface{}{})
		}
		query = query.Where("id IN ?", friendIDs)
	}

	if err := query.Order("current_game_name asc, roblox_username asc").Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch playing users"})
	}

	for _, u := range users {
		var uID uint64
		if u.CurrentUniverseID != nil {
			uID = *u.CurrentUniverseID
		}
		fmt.Printf("[CoPlayer Debug] User: %s (%s), GameName: '%s', UniverseID: %d\n", u.RobloxUsername, u.RobloxUserID, u.CurrentGameName, uID)
	}

	var allMaps []models.RobloxMap
	database.DB.Find(&allMaps)

	type PlayerInfo struct {
		ID                uint     `json:"id"`
		RobloxUserID      string   `json:"roblox_user_id"`
		RobloxUsername    string   `json:"roblox_username"`
		RobloxDisplayName string   `json:"roblox_display_name"`
		AvatarURL         string   `json:"avatar_url"`
		RoleName          string   `json:"role_name"`
		FriendsWith       []string `json:"friends_with"`
	}

	type GameGroup struct {
		GameName string       `json:"game_name"`
		Players  []PlayerInfo `json:"players"`
	}

	type GroupInfo struct {
		DisplayGameName string
		Players         []PlayerInfo
	}

	groupsMap := make(map[string]*GroupInfo)
	for _, u := range users {
		roleName := "Synced Friend"
		if u.RoleID != nil {
			roleName = u.Role.Name
		}
		p := PlayerInfo{
			ID:                u.ID,
			RobloxUserID:      u.RobloxUserID,
			RobloxUsername:    u.RobloxUsername,
			RobloxDisplayName: u.RobloxDisplayName,
			AvatarURL:         u.AvatarURL,
			RoleName:          roleName,
			FriendsWith:       make([]string, 0),
		}

		// Find matching map from DB (Roblox Map Database)
		var matchedMap *models.RobloxMap
		
		// 1. Try direct ID match first
		if u.CurrentUniverseID != nil && *u.CurrentUniverseID > 0 {
			for i := range allMaps {
				m := &allMaps[i]
				if m.UniverseID != nil && *u.CurrentUniverseID == *m.UniverseID {
					matchedMap = m
					break
				}
			}
		}

		// 2. Try string match (case-insensitive substring) only if no direct ID match was found
		if matchedMap == nil {
			for i := range allMaps {
				m := &allMaps[i]
				mName := strings.ToLower(m.Name)
				gName := strings.ToLower(u.CurrentGameName)
				if len(mName) >= 3 && (strings.Contains(gName, mName) || strings.Contains(mName, gName)) {
					matchedMap = m
					break
				}
			}
		}

		var key string
		var displayName = u.CurrentGameName

		if u.CurrentUniverseID != nil && *u.CurrentUniverseID > 0 {
			key = fmt.Sprintf("id_%d", *u.CurrentUniverseID)
			if matchedMap != nil {
				displayName = matchedMap.Name
			}
		} else if matchedMap != nil && matchedMap.UniverseID != nil && *matchedMap.UniverseID > 0 {
			key = fmt.Sprintf("id_%d", *matchedMap.UniverseID)
			displayName = matchedMap.Name
		} else {
			key = "name_" + u.CurrentGameName
		}

		if _, exists := groupsMap[key]; !exists {
			groupsMap[key] = &GroupInfo{
				DisplayGameName: displayName,
				Players:         []PlayerInfo{p},
			}
		} else {
			groupsMap[key].Players = append(groupsMap[key].Players, p)
		}
	}

	// Merge by resolved display name to prevent any duplicate card rendering in UI
	resMap := make(map[string][]PlayerInfo)
	for _, group := range groupsMap {
		name := strings.TrimSpace(group.DisplayGameName)
		if name == "" {
			name = "Unknown Game"
		}
		resMap[name] = append(resMap[name], group.Players...)
	}

	res := make([]GameGroup, 0)
	for gameName, players := range resMap {
		// Collect all database User IDs of players in this game group
		playerIDs := make([]uint, len(players))
		playerMap := make(map[uint]*PlayerInfo)
		for i := range players {
			playerIDs[i] = players[i].ID
			playerMap[players[i].ID] = &players[i]
		}

		// Find active friendships between these players in this group
		if len(playerIDs) > 1 {
			var friendships []models.Friend
			database.DB.Where("status = 'active' AND user_id IN ? AND friend_id IN ?", playerIDs, playerIDs).
				Find(&friendships)

			for _, f := range friendships {
				// f.UserID is friends with f.FriendID
				p1 := playerMap[f.UserID]
				p2 := playerMap[f.FriendID]
				if p1 != nil && p2 != nil {
					p1Name := p1.RobloxDisplayName
					if p1Name == "" {
						p1Name = p1.RobloxUsername
					}
					p2Name := p2.RobloxDisplayName
					if p2Name == "" {
						p2Name = p2.RobloxUsername
					}

					// Append to FriendsWith (avoid duplicates)
					alreadyAdded1 := false
					for _, name := range p1.FriendsWith {
						if name == p2Name {
							alreadyAdded1 = true
							break
						}
					}
					if !alreadyAdded1 {
						p1.FriendsWith = append(p1.FriendsWith, p2Name)
					}

					alreadyAdded2 := false
					for _, name := range p2.FriendsWith {
						if name == p1Name {
							alreadyAdded2 = true
							break
						}
					}
					if !alreadyAdded2 {
						p2.FriendsWith = append(p2.FriendsWith, p1Name)
					}
				}
			}
		}

		res = append(res, GameGroup{
			GameName: gameName,
			Players:  players,
		})
	}

	// Urutkan berdasarkan jumlah pemain terbanyak (descending)
	sort.Slice(res, func(i, j int) bool {
		return len(res[i].Players) > len(res[j].Players)
	})

	return c.JSON(res)
}

func SearchHistoricalCoPlayers(c *fiber.Ctx) error {
	roleName, _ := c.Locals("role").(string)
	scopeFriendsOnly, _ := c.Locals("scope_friends_only").(bool)

	mapName := c.Query("map_name")
	dateStr := c.Query("date")       // YYYY-MM-DD
	hourVal := c.QueryInt("hour", 8) // 0-23

	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	// Parse date in local timezone
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		loc = time.Local
	}

	// T_start = YYYY-MM-DD HH:00:00
	tStart, err := time.ParseInLocation("2006-01-02 15:04:05", fmt.Sprintf("%s %02d:00:00", dateStr, hourVal), loc)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid date or hour format"})
	}
	tEnd := tStart.Add(1 * time.Hour)

	// Fetch all users
	var users []models.User
	userQuery := database.DB.Preload("Role")
	if roleName != "admin" {
		userQuery = userQuery.Where("is_stealth = ?", false)
	}
	if scopeFriendsOnly {
		requestingUserID, err := getUserID(c)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
		}
		var friendIDs []uint
		database.DB.Model(&models.Friend{}).
			Where("user_id = ? AND status = 'active'", requestingUserID).
			Pluck("friend_id", &friendIDs)
		if len(friendIDs) == 0 {
			return c.JSON([]interface{}{})
		}
		userQuery = userQuery.Where("id IN ?", friendIDs)
	}
	if err := userQuery.Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch users"})
	}

	type PlayerInfo struct {
		ID                uint   `json:"id"`
		RobloxUserID      string `json:"roblox_user_id"`
		RobloxUsername    string `json:"roblox_username"`
		RobloxDisplayName string `json:"roblox_display_name"`
		AvatarURL         string `json:"avatar_url"`
		RoleName          string `json:"role_name"`
		PlayStartTime     string `json:"play_start_time"`
	}

	activePlayers := make([]PlayerInfo, 0)

	// Collect user IDs to query everything in batch
	userIDs := make([]uint, len(users))
	for i, u := range users {
		userIDs[i] = u.ID
	}

	if len(userIDs) == 0 {
		return c.JSON(activePlayers)
	}

	// 1. Get the single latest log ID before tStart for each user using DISTINCT ON
	var beforeLogIDs []uint
	if err := database.DB.Model(&models.ActivityLog{}).
		Where("user_id IN ? AND created_at < ?", userIDs, tStart).
		Order("user_id, created_at DESC").
		Select("DISTINCT ON (user_id) id").
		Find(&beforeLogIDs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch historical activity logs before start"})
	}

	// 2. Get all log IDs within the [tStart, tEnd] interval
	var intervalLogIDs []uint
	if err := database.DB.Model(&models.ActivityLog{}).
		Where("user_id IN ? AND created_at >= ? AND created_at <= ?", userIDs, tStart, tEnd).
		Pluck("id", &intervalLogIDs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch activity logs in time window"})
	}

	// 3. Load all these logs preloaded with their maps in chronological order (created_at asc)
	allLogIDs := append(beforeLogIDs, intervalLogIDs...)
	var allLogs []models.ActivityLog
	if len(allLogIDs) > 0 {
		if err := database.DB.Preload("Map").
			Where("id IN ?", allLogIDs).
			Order("created_at asc").
			Find(&allLogs).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load preloaded activity logs"})
		}
	}

	// Group the logs by UserID
	logsByUser := make(map[uint][]models.ActivityLog)
	for _, log := range allLogs {
		logsByUser[log.UserID] = append(logsByUser[log.UserID], log)
	}

	// For each user, check if they were in-game on the matched map during [tStart, tEnd]
	for _, u := range users {
		logs := logsByUser[u.ID]
		if len(logs) == 0 {
			continue
		}

		wasPlaying := false
		var sessionStart *time.Time

		var currentInGameLog *models.ActivityLog
		for i := 0; i < len(logs); i++ {
			log := logs[i]
			if log.Status == "In-Game" {
				if currentInGameLog != nil {
					// The previous In-Game session ended when this new session started!
					start := currentInGameLog.CreatedAt
					end := log.CreatedAt

					if start.Before(tEnd) && end.After(tStart) {
						currentGameName := currentInGameLog.GameName
						if currentInGameLog.Map != nil {
							currentGameName = currentInGameLog.Map.Name
						}

						if mapName == "" || strings.Contains(strings.ToLower(currentGameName), strings.ToLower(mapName)) {
							wasPlaying = true
							sessionStart = &start
							break
						}
					}
				}
				// Start the new In-Game session from this log
				currentInGameLog = &logs[i]
			} else {
				if currentInGameLog != nil {
					start := currentInGameLog.CreatedAt
					end := log.CreatedAt

					if start.Before(tEnd) && end.After(tStart) {
						currentGameName := currentInGameLog.GameName
						if currentInGameLog.Map != nil {
							currentGameName = currentInGameLog.Map.Name
						}

						if mapName == "" || strings.Contains(strings.ToLower(currentGameName), strings.ToLower(mapName)) {
							wasPlaying = true
							sessionStart = &start
							break
						}
					}
					currentInGameLog = nil
				}
			}
		}

		if currentInGameLog != nil && !wasPlaying {
			start := currentInGameLog.CreatedAt
			if start.Before(tEnd) {
				currentGameName := currentInGameLog.GameName
				if currentInGameLog.Map != nil {
					currentGameName = currentInGameLog.Map.Name
				}
				if mapName == "" || strings.Contains(strings.ToLower(currentGameName), strings.ToLower(mapName)) {
					wasPlaying = true
					sessionStart = &start
				}
			}
		}

		if wasPlaying {
			roleName := "Synced Friend"
			if u.RoleID != nil {
				roleName = u.Role.Name
			}
			startTimeStr := ""
			if sessionStart != nil {
				startTimeStr = sessionStart.In(loc).Format("15:04:05")
			}
			activePlayers = append(activePlayers, PlayerInfo{
				ID:                u.ID,
				RobloxUserID:      u.RobloxUserID,
				RobloxUsername:    u.RobloxUsername,
				RobloxDisplayName: u.RobloxDisplayName,
				AvatarURL:         u.AvatarURL,
				RoleName:          roleName,
				PlayStartTime:     startTimeStr,
			})
		}
	}

	return c.JSON(activePlayers)
}

func GetShadowActivities(c *fiber.Ctx) error {
	scopeFriendsOnly, _ := c.Locals("scope_friends_only").(bool)

	results := make([]models.ShadowActivity, 0)
	query := database.DB.Preload("User")

	if scopeFriendsOnly {
		// Hanya tampilkan insiden siluman dari teman user yang sedang login
		requestingUserID, err := getUserID(c)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
		}
		var friendIDs []uint
		database.DB.Model(&models.Friend{}).
			Where("user_id = ? AND status = 'active'", requestingUserID).
			Pluck("friend_id", &friendIDs)
		if len(friendIDs) == 0 {
			return c.JSON([]interface{}{})
		}
		query = query.Where("user_id IN ?", friendIDs)
	}

	if err := query.Order("created_at DESC").Find(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch shadow activities: " + err.Error()})
	}

	return c.JSON(results)
}

func ReviewShadowActivity(c *fiber.Ctx) error {
	id := c.Params("id")

	type Request struct {
		IsReviewed bool   `json:"is_reviewed"`
		AdminNotes string `json:"admin_notes"`
	}

	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	adminNotes := strings.TrimSpace(req.AdminNotes)
	if len(adminNotes) > 2000 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Admin notes too long (maximum 2000 characters)"})
	}

	result := database.DB.Model(&models.ShadowActivity{}).
		Where("id = ?", id).
		Select("is_reviewed", "admin_notes").
		Updates(models.ShadowActivity{
			IsReviewed: req.IsReviewed,
			AdminNotes: adminNotes,
		})

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update shadow activity: " + result.Error.Error()})
	}
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Shadow activity not found"})
	}

	var activity models.ShadowActivity
	if err := database.DB.Preload("User").First(&activity, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch updated shadow activity"})
	}

	return c.JSON(activity)
}
