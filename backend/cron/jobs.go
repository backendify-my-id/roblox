package cron

import (
	"fmt"
	"strconv"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/robfig/cron/v3"
)

func StartJobs() {
	c := cron.New()

	// Every 15 minutes (Profile & Friends Sync)
	c.AddFunc("*/15 * * * *", syncAllFriends)

	// Every 5 minutes
	c.AddFunc("*/5 * * * *", syncAllPresences)

	c.Start()
	LogCron("INFO", "Cron jobs scheduler successfully started and running in background.")
}

func syncAllFriends() {
	startTime := time.Now()
	LogCron("INFO", "Starting 15-minute friends & profile sync job...")

	lockKey := "lock:friends_sync"
	// Try to acquire lock with 14 minutes expiration (since job runs every 15 mins)
	acquired, err := cache.RDB.SetNX(cache.Ctx, lockKey, "locked", 14*time.Minute).Result()
	if err != nil {
		LogCron("ERROR", "[FriendsSync] Failed to acquire Redis lock due to error: %v", err)
		return
	}
	if !acquired {
		LogCron("WARNING", "[FriendsSync] Sync skipped: another instance is currently running the sync lock.")
		return
	}
	defer func() {
		cache.RDB.Del(cache.Ctx, lockKey)
		LogCron("INFO", "[FriendsSync] Released Redis lock '%s'.", lockKey)
	}()

	LogCron("INFO", "[FriendsSync] Successfully acquired Redis lock '%s' for friends & profile sync.", lockKey)

	var users []models.User
	// Only sync friends for registered users who are approved
	if err := database.DB.Where("role_id IS NOT NULL AND is_approved = ?", true).Find(&users).Error; err != nil {
		LogCron("ERROR", "[FriendsSync] Failed to fetch approved users for friend sync: %v", err)
		return
	}

	LogCron("INFO", "[FriendsSync] Found %d active users in database to perform friend sync for.", len(users))

	successCount := 0
	failCount := 0

	for idx, user := range users {
		checkKey := fmt.Sprintf("last_name_check:%d", user.ID)
		checkNames := false

		_, err := cache.RDB.Get(cache.Ctx, checkKey).Result()
		if err != nil { // key doesn't exist or expired
			checkNames = true
		}

		LogCron("INFO", "[FriendsSync] [%d/%d] Starting sync for user '%s' (RobloxUserID: %s, CheckNames: %t)",
			idx+1, len(users), user.RobloxUsername, user.RobloxUserID, checkNames)

		if err := services.SyncUserFriends(user.ID, user.RobloxUserID, checkNames); err != nil {
			LogCron("ERROR", "[FriendsSync] [%d/%d] Error syncing friends for user '%s': %v",
				idx+1, len(users), user.RobloxUsername, err)
			failCount++
		} else {
			LogCron("INFO", "[FriendsSync] [%d/%d] Successfully synced friends for user '%s'.",
				idx+1, len(users), user.RobloxUsername)
			successCount++
			if checkNames {
				// Update the check time on success with a 1-hour TTL
				cache.RDB.Set(cache.Ctx, checkKey, "done", 1*time.Hour)
				LogCron("INFO", "[FriendsSync] [%d/%d] Set last_name_check key for '%s' in Redis with 1-hour TTL.",
					idx+1, len(users), user.RobloxUsername)
			}
		}
	}

	duration := time.Since(startTime)
	LogCron("INFO", "[FriendsSync] Completed. Success: %d, Failed: %d, Duration: %v", successCount, failCount, duration)
}

func syncAllPresences() {
	startTime := time.Now()
	LogCron("INFO", "Starting 5-minute active friends presence sync job...")

	lockKey := "lock:presence_sync"
	// Try to acquire lock with 4 minutes expiration (since job runs every 5 mins)
	acquired, err := cache.RDB.SetNX(cache.Ctx, lockKey, "locked", 4*time.Minute).Result()
	if err != nil {
		LogCron("ERROR", "[PresenceSync] Failed to acquire Redis lock due to error: %v", err)
		return
	}
	if !acquired {
		LogCron("WARNING", "[PresenceSync] Sync skipped: another instance is currently running the presence sync lock.")
		return
	}
	defer func() {
		cache.RDB.Del(cache.Ctx, lockKey)
		LogCron("INFO", "[PresenceSync] Released Redis lock '%s'.", lockKey)
	}()

	LogCron("INFO", "[PresenceSync] Successfully acquired Redis lock '%s' for presence sync.", lockKey)

	var friends []models.Friend
	if err := database.DB.Preload("TargetUser").
		Joins("JOIN users owner ON friends.user_id = owner.id").
		Where("friends.status = ? AND owner.is_approved = ?", "active", true).
		Find(&friends).Error; err != nil {
		LogCron("ERROR", "[PresenceSync] Failed to fetch active friends for approved users: %v", err)
		return
	}

	LogCron("INFO", "[PresenceSync] Found %d active friend linkages to sync.", len(friends))

	if len(friends) == 0 {
		LogCron("INFO", "[PresenceSync] No active friends to check. Sync completed.")
		return
	}

	// Get all stealth users and their exemptions
	var stealthUsers []models.User
	if err := database.DB.Preload("StealthExempts").Where("is_stealth = ?", true).Find(&stealthUsers).Error; err != nil {
		LogCron("ERROR", "[PresenceSync] Failed to fetch stealth users: %v", err)
	}

	// stealthMap[AdminRobloxID][ViewerUserID] = true (means viewer CAN bypass)
	stealthMap := make(map[string]map[uint]bool)
	for _, su := range stealthUsers {
		exempts := make(map[uint]bool)
		for _, eu := range su.StealthExempts {
			exempts[eu.ID] = true
		}
		stealthMap[su.RobloxUserID] = exempts
	}

	if len(stealthMap) > 0 {
		LogCron("INFO", "[PresenceSync] [Stealth] Loaded %d active stealth users configuration into memory.", len(stealthMap))
	}

	// Deduplicate roblox IDs to minimize API calls
	idMap := make(map[uint64]bool)
	var uniqueIDs []uint64
	for _, f := range friends {
		rID, err := strconv.ParseUint(f.TargetUser.RobloxUserID, 10, 64)
		if err == nil {
			if !idMap[rID] {
				idMap[rID] = true
				uniqueIDs = append(uniqueIDs, rID)
			}
		}
	}

	LogCron("INFO", "[PresenceSync] Deduplicated active friend targets count: %d (original linkages: %d)",
		len(uniqueIDs), len(friends))

	// Batch into max 100 per request
	batchSize := 100
	presenceMap := make(map[uint64]services.PresenceData)

	for i := 0; i < len(uniqueIDs); i += batchSize {
		end := i + batchSize
		if end > len(uniqueIDs) {
			end = len(uniqueIDs)
		}
		batch := uniqueIDs[i:end]

		LogCron("INFO", "[PresenceSync] [API Request] Fetching presence for batch [%d-%d] (size: %d)...",
			i, end, len(batch))

		pData, err := services.GetPresences(batch)
		if err != nil {
			LogCron("ERROR", "[PresenceSync] [API Error] Failed to fetch presences for batch [%d-%d]: %v", i, end, err)
			continue
		}

		LogCron("INFO", "[PresenceSync] [API Response] Successfully received presence data for batch [%d-%d] (received details: %d)",
			i, end, len(pData))

		for k, v := range pData {
			presenceMap[k] = v
		}
	}

	// Track updated user IDs to prevent duplicate logs/updates for the same user targeted by multiple people
	updatedUserIDs := make(map[uint]bool)
	changeCount := 0

	// Update friends and log activities
	for _, f := range friends {
		if updatedUserIDs[f.TargetUser.ID] {
			continue // Already processed this user in this sync run
		}

		rID, err := strconv.ParseUint(f.TargetUser.RobloxUserID, 10, 64)
		if err != nil {
			LogCron("ERROR", "[PresenceSync] Failed to parse RobloxUserID '%s' to uint64: %v", f.TargetUser.RobloxUserID, err)
			continue
		}

		if p, exists := presenceMap[rID]; exists {
			statusStr := "Offline"
			switch p.UserPresenceType {
			case 1:
				statusStr = "Online"
			case 2:
				statusStr = "In-Game"
			case 3:
				statusStr = "In-Studio"
			case 4:
				statusStr = "Invisible"
			}

			// Jika Offline, pastikan GameName menjadi "-"
			if statusStr == "Offline" {
				p.LastLocation = "-"
			}

			if f.TargetUser.CurrentPresence != statusStr || f.TargetUser.CurrentGameName != p.LastLocation {
				oldPresence := f.TargetUser.CurrentPresence
				oldGame := f.TargetUser.CurrentGameName

				f.TargetUser.CurrentPresence = statusStr
				f.TargetUser.CurrentGameName = p.LastLocation
				database.DB.Save(&f.TargetUser)

				_, isStealth := stealthMap[f.TargetUser.RobloxUserID]

				newLog := models.ActivityLog{
					UserID:    f.TargetUser.ID,
					Status:    statusStr,
					GameName:  p.LastLocation,
					IsStealth: isStealth,
				}
				database.DB.Create(&newLog)

				LogCron("INFO", "[PresenceSync] [Change Detected] User '%s' (RobloxUserID: %d) status changed from '%s' (%s) to '%s' (%s). Logged new activity record (Stealth: %t).",
					f.TargetUser.RobloxUsername, rID, oldPresence, oldGame, statusStr, p.LastLocation, isStealth)
				changeCount++

				services.Hub.Broadcast(services.WSMessage{
					Type:   "presence_update",
					UserID: f.TargetUser.ID,
				})

				// Auto-create or update map in database if the target is In-Game
				if statusStr == "In-Game" && p.LastLocation != "" && p.LastLocation != "-" {
					if p.UniverseId != nil && *p.UniverseId > 0 {
						var existingMap models.RobloxMap
						if err := database.DB.Where("universe_id = ?", p.UniverseId).First(&existingMap).Error; err == nil {
							// Exists! Check if the name has changed or description/url_path are empty
							hasChanges := false
							if existingMap.Name != p.LastLocation {
								oldName := existingMap.Name
								existingMap.Name = p.LastLocation
								hasChanges = true
								LogCron("INFO", "[AutoMap] [Update] Updated map name for UniverseID %d: '%s' -> '%s'", *p.UniverseId, oldName, p.LastLocation)
							}
							if existingMap.Description == "" || existingMap.UrlPath == "" {
								gName, gDesc, gRootPlaceID, err := services.GetUniverseDetails(*p.UniverseId)
								if err == nil {
									if existingMap.Description == "" {
										existingMap.Description = gDesc
										hasChanges = true
									}
									if existingMap.UrlPath == "" {
										existingMap.UrlPath = fmt.Sprintf("/games/%d/redirect", gRootPlaceID)
										hasChanges = true
									}
									if (existingMap.PlaceID == nil || *existingMap.PlaceID == 0) && gRootPlaceID > 0 {
										existingMap.PlaceID = &gRootPlaceID
										hasChanges = true
									}
									if gName != "" && existingMap.Name != gName {
										existingMap.Name = gName
										hasChanges = true
									}
									LogCron("INFO", "[AutoMap] [Details Fetched] Fetched info for existing UniverseID %d. Name: '%s', PlaceID: %d", *p.UniverseId, gName, gRootPlaceID)
								} else {
									LogCron("ERROR", "[AutoMap] [API Error] Failed to fetch details for UniverseID %d: %v", *p.UniverseId, err)
								}
							}
							if hasChanges {
								existingMap.UpdatedAt = time.Now()
								database.DB.Save(&existingMap)
							}
						} else {
							// Does not exist by UniverseID. Check if there is an existing manual entry with the same name and NO UniverseID
							var nameMap models.RobloxMap
							if err := database.DB.Where("name = ? AND (universe_id IS NULL OR universe_id = 0)", p.LastLocation).First(&nameMap).Error; err == nil {
								// Match by name! Link the UniverseID and PlaceID to it, and fetch details
								gName, gDesc, gRootPlaceID, err := services.GetUniverseDetails(*p.UniverseId)
								urlPath := ""
								var resolvedPlaceID *uint64 = p.PlaceId
								if err == nil {
									urlPath = fmt.Sprintf("/games/%d/redirect", gRootPlaceID)
									if resolvedPlaceID == nil || *resolvedPlaceID == 0 {
										resolvedPlaceID = &gRootPlaceID
									}
									if gName != "" {
										p.LastLocation = gName
									}
									nameMap.Description = gDesc
									nameMap.UrlPath = urlPath
									LogCron("INFO", "[AutoMap] [Link] Fetched details to link with name-based map: UniverseID %d, PlaceID: %d", *p.UniverseId, gRootPlaceID)
								} else {
									LogCron("ERROR", "[AutoMap] [API Error] Failed to fetch link details for UniverseID %d: %v", *p.UniverseId, err)
								}
								nameMap.UniverseID = p.UniverseId
								nameMap.PlaceID = resolvedPlaceID
								nameMap.UpdatedAt = time.Now()
								database.DB.Save(&nameMap)
								LogCron("INFO", "[AutoMap] Linked UniverseID %d and PlaceID %d to manual map: '%s'", *p.UniverseId, *resolvedPlaceID, p.LastLocation)
							} else {
								// Brand new map! Fetch details first
								gName, gDesc, gRootPlaceID, err := services.GetUniverseDetails(*p.UniverseId)
								urlPath := ""
								var resolvedPlaceID *uint64 = p.PlaceId
								if err == nil {
									urlPath = fmt.Sprintf("/games/%d/redirect", gRootPlaceID)
									if resolvedPlaceID == nil || *resolvedPlaceID == 0 {
										resolvedPlaceID = &gRootPlaceID
									}
									if gName != "" {
										p.LastLocation = gName
									}
									LogCron("INFO", "[AutoMap] [New Details] Fetched info for brand new UniverseID %d. Name: '%s', PlaceID: %d", *p.UniverseId, gName, gRootPlaceID)
								} else {
									LogCron("ERROR", "[AutoMap] [API Error] Failed to fetch details for new UniverseID %d: %v", *p.UniverseId, err)
								}

								newMap := models.RobloxMap{
									Name:        p.LastLocation,
									UniverseID:  p.UniverseId,
									PlaceID:     resolvedPlaceID,
									Description: gDesc,
									UrlPath:     urlPath,
									CreatedAt:   time.Now(),
									UpdatedAt:   time.Now(),
								}
								if err := database.DB.Create(&newMap).Error; err == nil {
									LogCron("INFO", "[AutoMap] Successfully created brand new RobloxMap with UniverseID %d: '%s'", *p.UniverseId, p.LastLocation)
								} else {
									LogCron("ERROR", "[AutoMap] Failed to write new RobloxMap with UniverseID %d to DB: %v", *p.UniverseId, err)
								}
							}
						}
					} else {
						// Fallback: Name-only check if UniverseId is missing
						var existingMap models.RobloxMap
						if err := database.DB.Where("name = ?", p.LastLocation).First(&existingMap).Error; err != nil {
							newMap := models.RobloxMap{
								Name:      p.LastLocation,
								CreatedAt: time.Now(),
								UpdatedAt: time.Now(),
							}
							if err := database.DB.Create(&newMap).Error; err == nil {
								LogCron("INFO", "[AutoMap] Fallback name-only map added to DB: '%s'", p.LastLocation)
							}
						}
					}
				}

				updatedUserIDs[f.TargetUser.ID] = true
			}
		}
	}

	duration := time.Since(startTime)
	LogCron("INFO", "[PresenceSync] Completed. Total processed: %d targets, Status changes detected: %d, Duration: %v",
		len(friends), changeCount, duration)

}
