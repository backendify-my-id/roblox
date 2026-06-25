package cron

import (
	"fmt"
	"strconv"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/apany/roblox-friend-tracker/utils"
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

	// Fetch all approved registered users
	var registeredUsers []models.User
	if err := database.DB.Where("role_id IS NOT NULL AND is_approved = ?", true).Find(&registeredUsers).Error; err != nil {
		LogCron("ERROR", "[PresenceSync] Failed to fetch approved registered users: %v", err)
		return
	}

	if len(registeredUsers) == 0 {
		LogCron("INFO", "[PresenceSync] No approved registered users to sync. Completed.")
		return
	}

	// stealthMap[AdminRobloxID][ViewerUserID] = true (means viewer CAN bypass)
	var stealthUsers []models.User
	if err := database.DB.Preload("StealthExempts").Where("is_stealth = ?", true).Find(&stealthUsers).Error; err != nil {
		LogCron("ERROR", "[PresenceSync] Failed to fetch stealth users: %v", err)
	}
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

	// We will query Roblox Presence API for each registered user's cohort (themselves + their active friends)
	// and merge the results into a global presence map.
	mergedPresences := make(map[uint64]services.PresenceData)

	getPresenceTypeRank := func(pType int) int {
		switch pType {
		case 2: // In-Game
			return 3
		case 3: // In-Studio
			return 2
		case 1: // Online
			return 1
		default:
			return 0 // Offline, Invisible, etc.
		}
	}

	for _, user := range registeredUsers {
		var friendRobloxIDs []string
		database.DB.Model(&models.Friend{}).
			Joins("JOIN users ON friends.friend_id = users.id").
			Where("friends.user_id = ? AND friends.status = ?", user.ID, "active").
			Pluck("users.roblox_user_id", &friendRobloxIDs)

		var cohortRobloxIDStrings []string
		cohortRobloxIDStrings = append(cohortRobloxIDStrings, user.RobloxUserID)
		cohortRobloxIDStrings = append(cohortRobloxIDStrings, friendRobloxIDs...)

		if len(cohortRobloxIDStrings) == 0 {
			continue
		}

		// Deduplicate and parse to uint64 for the API call
		idSet := make(map[uint64]bool)
		var cohortRobloxIDs []uint64
		for _, idStr := range cohortRobloxIDStrings {
			rID, parseErr := strconv.ParseUint(idStr, 10, 64)
			if parseErr == nil && !idSet[rID] {
				idSet[rID] = true
				cohortRobloxIDs = append(cohortRobloxIDs, rID)
			}
		}

		if len(cohortRobloxIDs) == 0 {
			continue
		}

		// Decrypt user-specific cookie
		var userCookie string
		if user.RobloxCookie != "" {
			decrypted, decryptErr := utils.Decrypt(user.RobloxCookie)
			if decryptErr == nil {
				userCookie = decrypted
			} else {
				LogCron("WARNING", "[PresenceSync] Gagal mendekripsi cookie untuk user '%s': %v. Menggunakan fallback global.", user.RobloxUsername, decryptErr)
			}
		}

		// Fetch presences in batches of 100 for this cohort
		batchSize := 100
		for i := 0; i < len(cohortRobloxIDs); i += batchSize {
			end := i + batchSize
			if end > len(cohortRobloxIDs) {
				end = len(cohortRobloxIDs)
			}
			batch := cohortRobloxIDs[i:end]

			pData, apiErr := services.GetPresences(batch, userCookie)
			// Fallback jika API gagal (misalnya cookie user expired/HTTP 401)
			if apiErr != nil && userCookie != "" {
				LogCron("WARNING", "[PresenceSync] Gagal mengambil presensi untuk batch user '%s': %v. Mencoba ulang dengan cookie global...", user.RobloxUsername, apiErr)
				pData, apiErr = services.GetPresences(batch, "") // Call with empty cookie to fallback to global
			}

			if apiErr != nil {
				LogCron("ERROR", "[PresenceSync] Gagal mengambil presensi batch: %v", apiErr)
				continue
			}

			// Merge into mergedPresences
			for k, v := range pData {
				existing, exists := mergedPresences[k]
				if !exists {
					mergedPresences[k] = v
				} else {
					vRank := getPresenceTypeRank(v.UserPresenceType)
					exRank := getPresenceTypeRank(existing.UserPresenceType)
					if vRank > exRank {
						mergedPresences[k] = v
					} else if vRank == exRank {
						// Jika status sama (misalnya sama-sama In-Game), prioritaskan data yang memiliki nama game lebih lengkap
						if (existing.LastLocation == "" || existing.LastLocation == "-") && v.LastLocation != "" && v.LastLocation != "-" {
							mergedPresences[k] = v
						}
					}
				}
			}
		}
	}

	if len(mergedPresences) == 0 {
		LogCron("INFO", "[PresenceSync] Tidak ada data presensi yang berhasil diambil. Selesai.")
		return
	}

	// Fetch all user records from DB that correspond to the parsed Roblox IDs in mergedPresences
	var uniqueRobloxIDStrings []string
	for k := range mergedPresences {
		uniqueRobloxIDStrings = append(uniqueRobloxIDStrings, strconv.FormatUint(k, 10))
	}

	var usersToUpdate []models.User
	if err := database.DB.Where("roblox_user_id IN ?", uniqueRobloxIDStrings).Find(&usersToUpdate).Error; err != nil {
		LogCron("ERROR", "[PresenceSync] Gagal mengambil user terdaftar untuk diperbarui: %v", err)
		return
	}

	changeCount := 0

	// Update users and log activities using the merged presence data
	for _, u := range usersToUpdate {
		rID, parseErr := strconv.ParseUint(u.RobloxUserID, 10, 64)
		if parseErr != nil {
			LogCron("ERROR", "[PresenceSync] Failed to parse RobloxUserID '%s' to uint64: %v", u.RobloxUserID, parseErr)
			continue
		}

		if p, exists := mergedPresences[rID]; exists {
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

			if u.CurrentPresence != statusStr || u.CurrentGameName != p.LastLocation {
				oldPresence := u.CurrentPresence
				oldGame := u.CurrentGameName

				u.CurrentPresence = statusStr
				u.CurrentGameName = p.LastLocation
				u.UpdatedAt = time.Now()
				database.DB.Model(&u).Select("current_presence", "current_game_name", "updated_at").Updates(&u)

				var mapID *uint

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
							if existingMap.Description == "" || existingMap.UrlPath == "" || existingMap.PlaceID == nil || *existingMap.PlaceID == 0 {
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
							mapID = &existingMap.ID
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
								mapID = &nameMap.ID
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
									mapID = &newMap.ID
								} else {
									LogCron("ERROR", "[AutoMap] Failed to write new RobloxMap with UniverseID %d to DB: %v", *p.UniverseId, err)
								}
							}
						}
					} else {
						// Fallback: Name-only check if UniverseId is missing
						var existingMap models.RobloxMap
						if err := database.DB.Where("name = ?", p.LastLocation).First(&existingMap).Error; err == nil {
							mapID = &existingMap.ID
						} else {
							newMap := models.RobloxMap{
								Name:      p.LastLocation,
								CreatedAt: time.Now(),
								UpdatedAt: time.Now(),
							}
							if err := database.DB.Create(&newMap).Error; err == nil {
								LogCron("INFO", "[AutoMap] Fallback name-only map added to DB: '%s'", p.LastLocation)
								mapID = &newMap.ID
							}
						}
					}
				}

				_, isStealth := stealthMap[u.RobloxUserID]

				newLog := models.ActivityLog{
					UserID:    u.ID,
					Status:    statusStr,
					GameName:  p.LastLocation,
					MapID:     mapID,
					IsStealth: isStealth,
				}
				database.DB.Create(&newLog)

				LogCron("INFO", "[PresenceSync] [Change Detected] User '%s' (RobloxUserID: %d) status changed from '%s' (%s) to '%s' (%s). Logged new activity record (Stealth: %t).",
					u.RobloxUsername, rID, oldPresence, oldGame, statusStr, p.LastLocation, isStealth)
				changeCount++

				services.Hub.Broadcast(services.WSMessage{
					Type:   "presence_update",
					UserID: u.ID,
				})
			}
		}
	}

	duration := time.Since(startTime)
	LogCron("INFO", "[PresenceSync] Completed. Total processed: %d targets, Status changes detected: %d, Duration: %v",
		len(usersToUpdate), changeCount, duration)
}
