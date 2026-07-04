package cron

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/apany/roblox-friend-tracker/utils"
	"github.com/robfig/cron/v3"
)

func getInstanceConfig() (int, int) {
	return cache.GetClusterConfig()
}

func updateCronMetadata(jobName string, instanceID int, status string, start time.Time, duration time.Duration, extra map[string]interface{}) {
	ctx := cache.Ctx
	rdb := cache.RDB
	if rdb == nil {
		return
	}

	key := fmt.Sprintf("cron_metadata:%s:%d", jobName, instanceID)
	vals := map[string]interface{}{
		"job_name":    jobName,
		"instance_id": instanceID,
		"status":      status,
		"last_run":    time.Now().Format("02/01/2006, 15:04:05"),
	}
	if !start.IsZero() {
		vals["start_time"] = start.Format("02/01/2006, 15:04:05")
	} else {
		vals["start_time"] = "-"
	}
	if duration > 0 {
		vals["duration_ms"] = int64(duration.Milliseconds())
	} else {
		vals["duration_ms"] = int64(0)
	}

	for k, v := range extra {
		vals[k] = v
	}

	rdb.HSet(ctx, key, vals)
	rdb.Expire(ctx, key, 7*24*time.Hour) // Simpan selama 7 hari

	// Broadcast update over WebSocket to admins
	if services.Hub != nil {
		procCount, _ := vals["processed_count"].(int)
		if procCount == 0 {
			if pcStr, ok := vals["processed_count"].(string); ok {
				procCount, _ = strconv.Atoi(pcStr)
			}
		}
		failCount, _ := vals["failed_count"].(int)
		if failCount == 0 {
			if fcStr, ok := vals["failed_count"].(string); ok {
				failCount, _ = strconv.Atoi(fcStr)
			}
		}
		chgCount, _ := vals["change_count"].(int)
		if chgCount == 0 {
			if ccStr, ok := vals["change_count"].(string); ok {
				chgCount, _ = strconv.Atoi(ccStr)
			}
		}

		var durMs int64
		if dm, ok := vals["duration_ms"].(int64); ok {
			durMs = dm
		}

		services.Hub.Broadcast(services.WSMessage{
			Type: "cron_progress",
			Payload: map[string]interface{}{
				"remaining_hits":  services.GetRemainingHits(),
				"max_hits":        80,
				"job_name":        jobName,
				"instance_id":     instanceID,
				"status":          status,
				"start_time":      vals["start_time"],
				"last_run":        vals["last_run"],
				"duration_ms":     durMs,
				"processed_count": procCount,
				"failed_count":    failCount,
				"change_count":    chgCount,
			},
		})
	}
}

func StartJobs() {
	instanceID, _ := getInstanceConfig()
	if cache.RDB != nil {
		cache.RDB.Del(cache.Ctx, fmt.Sprintf("lock:friends_sync:%d", instanceID))
		cache.RDB.Del(cache.Ctx, fmt.Sprintf("lock:presence_sync:%d", instanceID))
		LogCron("INFO", "[Startup] Cleared stale Redis locks for instance %d", instanceID)
	}

	c := cron.New()

	// Every 15 minutes (Profile & Friends Sync)
	c.AddFunc("*/15 * * * *", syncAllFriends)

	// Every 5 minutes (Presence Sync)
	c.AddFunc("*/5 * * * *", syncAllPresences)

	// Every day at midnight (Auto-backup database)
	c.AddFunc("0 0 * * *", AutoBackupDatabase)

	c.Start()
	LogCron("INFO", "Cron jobs scheduler started.")
}

func AutoBackupDatabase() {
	LogCron("INFO", "[AutoBackup] Starting daily database auto-backup...")
	
	backupDir := "./uploads/db"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		LogCron("ERROR", "[AutoBackup] Failed to create backup directory: %v", err)
		return
	}

	filename := fmt.Sprintf("backup_%s.sql", time.Now().Format("20060102_150405"))
	path := filepath.Join(backupDir, filename)

	if err := services.RunDbBackup(path); err != nil {
		LogCron("ERROR", "[AutoBackup] Failed to run database backup: %v", err)
		return
	}

	LogCron("INFO", "[AutoBackup] Daily auto-backup completed successfully. Saved to: %s", path)
}

func syncAllFriends() {
	startTime := time.Now()
	LogCron("INFO", "Starting 15-minute friends & profile sync job...")

	instanceID, totalInstances := getInstanceConfig()
	updateCronMetadata("friends_sync", instanceID, "running", startTime, 0, map[string]interface{}{
		"processed_count": 0,
		"failed_count":    0,
	})
	if cache.RDB != nil {
		lockKey := fmt.Sprintf("lock:friends_sync:%d", instanceID)
		acquired, err := cache.RDB.SetNX(cache.Ctx, lockKey, "locked", 14*time.Minute).Result()
		if err != nil {
			LogCron("ERROR", "[FriendsSync] Failed to acquire Redis lock due to error: %v", err)
			return
		}
		if !acquired {
			LogCron("WARNING", "[FriendsSync] Sync skipped: another instance is currently running the sync lock for instance %d.", instanceID)
			return
		}
		defer func() {
			cache.RDB.Del(cache.Ctx, lockKey)
			LogCron("INFO", "[FriendsSync] Released Redis lock '%s'.", lockKey)
		}()
		LogCron("INFO", "[FriendsSync] Successfully acquired Redis lock '%s' for friends & profile sync.", lockKey)
	} else {
		LogCron("WARNING", "[FriendsSync] Redis connection is offline. Running sync without lock...")
	}

	var users []models.User
	// Only sync friends for registered users who are approved, partitioned by instance ID if multi-instance
	dbQuery := database.DB.Where("role_id IS NOT NULL AND is_approved = ?", true)
	if totalInstances > 1 {
		dbQuery = dbQuery.Where("id % ? = ?", totalInstances, instanceID - 1)
	}

	if err := dbQuery.Find(&users).Error; err != nil {
		LogCron("ERROR", "[FriendsSync] Failed to fetch approved users for friend sync: %v", err)
		return
	}

	LogCron("INFO", "[FriendsSync] [Instance %d/%d] Found %d active users in database to perform friend sync for.", instanceID, totalInstances, len(users))

	successCount := 0
	failCount := 0

	for idx, user := range users {
		LogCron("INFO", "[FriendsSync] [%d/%d] Starting sync for user '%s' (RobloxUserID: %s)",
			idx+1, len(users), user.RobloxUsername, user.RobloxUserID)

		if err := services.SyncUserFriends(user.ID, user.RobloxUserID, true); err != nil {
			LogCron("ERROR", "[FriendsSync] [%d/%d] Error syncing friends for user '%s': %v",
				idx+1, len(users), user.RobloxUsername, err)
			failCount++
		} else {
			LogCron("INFO", "[FriendsSync] [%d/%d] Successfully synced friends for user '%s'.",
				idx+1, len(users), user.RobloxUsername)
			successCount++
		}
	}

	duration := time.Since(startTime)
	LogCron("INFO", "[FriendsSync] Completed. Success: %d, Failed: %d, Duration: %v", successCount, failCount, duration)
	updateCronMetadata("friends_sync", instanceID, "idle", startTime, duration, map[string]interface{}{
		"processed_count": successCount,
		"failed_count":    failCount,
	})
}

func getPresenceTypeRank(pType int) int {
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

func syncAllPresences() {
	startTime := time.Now()
	LogCron("INFO", "Starting 5-minute active friends presence sync job...")

	instanceID, totalInstances := getInstanceConfig()
	updateCronMetadata("presence_sync", instanceID, "running", startTime, 0, map[string]interface{}{
		"processed_count": 0,
		"change_count":    0,
	})
	if cache.RDB != nil {
		lockKey := fmt.Sprintf("lock:presence_sync:%d", instanceID)
		acquired, err := cache.RDB.SetNX(cache.Ctx, lockKey, "locked", 4*time.Minute).Result()
		if err != nil {
			LogCron("ERROR", "[PresenceSync] Failed to acquire Redis lock due to error: %v", err)
			return
		}
		if !acquired {
			LogCron("WARNING", "[PresenceSync] Sync skipped: another instance is currently running the presence sync lock for instance %d.", instanceID)
			return
		}
		defer func() {
			cache.RDB.Del(cache.Ctx, lockKey)
			LogCron("INFO", "[PresenceSync] Released Redis lock '%s'.", lockKey)
		}()
		LogCron("INFO", "[PresenceSync] Successfully acquired Redis lock '%s' for presence sync.", lockKey)
	} else {
		LogCron("WARNING", "[PresenceSync] Redis connection is offline. Running sync without lock...")
	}

	// Fetch all approved registered users, partitioned by instance ID if multi-instance
	var registeredUsers []models.User
	dbQuery := database.DB.Where("role_id IS NOT NULL AND is_approved = ?", true)
	if totalInstances > 1 {
		dbQuery = dbQuery.Where("id % ? = ?", totalInstances, instanceID - 1)
	}

	if err := dbQuery.Find(&registeredUsers).Error; err != nil {
		LogCron("ERROR", "[PresenceSync] Failed to fetch approved registered users: %v", err)
		return
	}

	if len(registeredUsers) == 0 {
		LogCron("INFO", "[PresenceSync] [Instance %d/%d] No approved registered users to sync. Completed.", instanceID, totalInstances)
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

	// Group Roblox User IDs by the decrypted cookie they should use.
	// Key: Cookie string, Value: Slice of Roblox IDs to check
	cookieGroups := make(map[string][]uint64)
	
	// Map to keep track of which user IDs are queried per cookie to avoid duplicates
	cookieIdSets := make(map[string]map[uint64]bool)

	addToGroup := func(cookie string, ids []uint64) {
		if _, exists := cookieIdSets[cookie]; !exists {
			cookieIdSets[cookie] = make(map[uint64]bool)
		}
		for _, id := range ids {
			if !cookieIdSets[cookie][id] {
				cookieIdSets[cookie][id] = true
				cookieGroups[cookie] = append(cookieGroups[cookie], id)
			}
		}
	}

	globalCookie := services.GetGlobalCookie()

	for _, user := range registeredUsers {
		var friendRobloxIDs []string
		database.DB.Model(&models.Friend{}).
			Joins("JOIN users ON friends.friend_id = users.id").
			Where("friends.user_id = ? AND friends.status = ?", user.ID, "active").
			Pluck("users.roblox_user_id", &friendRobloxIDs)

		var cohortRobloxIDs []uint64
		// Add self
		if rID, parseErr := strconv.ParseUint(user.RobloxUserID, 10, 64); parseErr == nil {
			cohortRobloxIDs = append(cohortRobloxIDs, rID)
		}
		// Add friends
		for _, idStr := range friendRobloxIDs {
			if rID, parseErr := strconv.ParseUint(idStr, 10, 64); parseErr == nil {
				cohortRobloxIDs = append(cohortRobloxIDs, rID)
			}
		}

		if len(cohortRobloxIDs) == 0 {
			continue
		}

		// Decrypt user-specific cookie
		userCookie := ""
		if user.RobloxCookie != "" {
			decrypted, decryptErr := utils.Decrypt(user.RobloxCookie)
			if decryptErr == nil && decrypted != "" {
				userCookie = decrypted
			} else if decryptErr != nil {
				LogCron("WARNING", "[PresenceSync] Gagal mendekripsi cookie untuk user '%s': %v. Menggunakan fallback global.", user.RobloxUsername, decryptErr)
			}
		}

		if userCookie == "" {
			addToGroup(globalCookie, cohortRobloxIDs)
		} else {
			addToGroup(userCookie, cohortRobloxIDs)
		}
	}

	mergedPresences := make(map[uint64]services.PresenceData)

	for cookie, robloxIDs := range cookieGroups {
		batchSize := 100
		for i := 0; i < len(robloxIDs); i += batchSize {
			end := i + batchSize
			if end > len(robloxIDs) {
				end = len(robloxIDs)
			}
			batch := robloxIDs[i:end]

			pData, apiErr := services.GetPresences(batch, cookie)
			// Fallback jika API gagal (misalnya cookie user expired/HTTP 401)
			if apiErr != nil && cookie != globalCookie && cookie != "" {
				LogCron("WARNING", "[PresenceSync] Gagal mengambil presensi dengan cookie user. Mencoba ulang dengan cookie global...")
				pData, apiErr = services.GetPresences(batch, globalCookie)
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

			universeChanged := (u.CurrentUniverseID == nil && p.UniverseId != nil) || (u.CurrentUniverseID != nil && p.UniverseId == nil) || (u.CurrentUniverseID != nil && p.UniverseId != nil && *u.CurrentUniverseID != *p.UniverseId)
			placeChanged := (u.CurrentPlaceID == nil && p.PlaceId != nil) || (u.CurrentPlaceID != nil && p.PlaceId == nil) || (u.CurrentPlaceID != nil && p.PlaceId != nil && *u.CurrentPlaceID != *p.PlaceId)

			if u.CurrentPresence != statusStr || u.CurrentGameName != p.LastLocation || universeChanged || placeChanged {
				oldPresence := u.CurrentPresence
				oldGame := u.CurrentGameName

				u.CurrentPresence = statusStr
				resolvedGameName := p.LastLocation
				if statusStr == "Offline" {
					u.CurrentUniverseID = nil
					u.CurrentPlaceID = nil
				} else {
					u.CurrentUniverseID = p.UniverseId
					u.CurrentPlaceID = p.PlaceId
				}

				var mapID *uint

				// Auto-create or update map in database if the target is In-Game
				if statusStr == "In-Game" && p.LastLocation != "" && p.LastLocation != "-" {
					if p.UniverseId != nil && *p.UniverseId > 0 {
						var existingMap models.RobloxMap
						if err := database.DB.Where("universe_id = ?", p.UniverseId).First(&existingMap).Error; err == nil {
							// Exists! Check if description/url_path are empty or need update
							hasChanges := false
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
									if existingMap.Name == "" && gName != "" {
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
							if existingMap.Name != "" {
								resolvedGameName = existingMap.Name
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
									if nameMap.Name == "" && gName != "" {
										nameMap.Name = gName
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
								if nameMap.Name != "" {
									resolvedGameName = nameMap.Name
								}
							} else {
								// Brand new map! Fetch details first
								gName, gDesc, gRootPlaceID, err := services.GetUniverseDetails(*p.UniverseId)
								urlPath := ""
								var resolvedPlaceID *uint64 = p.PlaceId
								mapName := p.LastLocation
								if err == nil {
									urlPath = fmt.Sprintf("/games/%d/redirect", gRootPlaceID)
									if resolvedPlaceID == nil || *resolvedPlaceID == 0 {
										resolvedPlaceID = &gRootPlaceID
									}
									if mapName == "" && gName != "" {
										mapName = gName
									}
									LogCron("INFO", "[AutoMap] [New Details] Fetched info for brand new UniverseID %d. Name: '%s', PlaceID: %d", *p.UniverseId, gName, gRootPlaceID)
								} else {
									LogCron("ERROR", "[AutoMap] [API Error] Failed to fetch details for new UniverseID %d: %v", *p.UniverseId, err)
								}

								newMap := models.RobloxMap{
									Name:        mapName,
									UniverseID:  p.UniverseId,
									PlaceID:     resolvedPlaceID,
									Description: gDesc,
									UrlPath:     urlPath,
									CreatedAt:   time.Now(),
									UpdatedAt:   time.Now(),
								}
								if err := database.DB.Create(&newMap).Error; err == nil {
									LogCron("INFO", "[AutoMap] Successfully created brand new RobloxMap with UniverseID %d: '%s'", *p.UniverseId, mapName)
									mapID = &newMap.ID
									if newMap.Name != "" {
										resolvedGameName = newMap.Name
									}
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
							if existingMap.Name != "" {
								resolvedGameName = existingMap.Name
							}
						} else {
							newMap := models.RobloxMap{
								Name:      p.LastLocation,
								CreatedAt: time.Now(),
								UpdatedAt: time.Now(),
							}
							if err := database.DB.Create(&newMap).Error; err == nil {
								LogCron("INFO", "[AutoMap] Fallback name-only map added to DB: '%s'", p.LastLocation)
								mapID = &newMap.ID
								if newMap.Name != "" {
									resolvedGameName = newMap.Name
								}
							}
						}
					}
				}

				u.CurrentGameName = resolvedGameName
				u.UpdatedAt = time.Now()
				database.DB.Model(&u).Select("current_presence", "current_game_name", "current_universe_id", "current_place_id", "updated_at").Updates(&u)

				_, isStealth := stealthMap[u.RobloxUserID]

				newLog := models.ActivityLog{
					UserID:    u.ID,
					Status:    statusStr,
					GameName:  resolvedGameName,
					MapID:     mapID,
					IsStealth: isStealth,
				}
				database.DB.Create(&newLog)

				LogCron("INFO", "[PresenceSync] [Change Detected] User '%s' (RobloxUserID: %d) status changed from '%s' (%s) to '%s' (%s). Logged new activity record (Stealth: %t).",
					u.RobloxUsername, rID, oldPresence, oldGame, statusStr, resolvedGameName, isStealth)
				changeCount++

				services.Hub.Broadcast(services.WSMessage{
					Type:   "presence_update",
					UserID: u.ID,
				})
			}
		}
	}

	// Reset presences of orphan friends who are no longer actively tracked by any registered user
	cleanupOrphanPresences()

	duration := time.Since(startTime)
	LogCron("INFO", "[PresenceSync] Completed. Total processed: %d targets, Status changes detected: %d, Duration: %v",
		len(usersToUpdate), changeCount, duration)
	updateCronMetadata("presence_sync", instanceID, "idle", startTime, duration, map[string]interface{}{
		"processed_count": len(usersToUpdate),
		"change_count":    changeCount,
	})
}

func cleanupOrphanPresences() {
	tx := database.DB.Exec(`
		UPDATE users 
		SET current_presence = 'Offline', 
			current_game_name = '-', 
			current_universe_id = NULL, 
			current_place_id = NULL,
			updated_at = ?
		WHERE role_id IS NULL 
		  AND id NOT IN (
			  SELECT DISTINCT friend_id 
			  FROM friends 
			  WHERE status = 'active'
		  )
		  AND (current_presence != 'Offline' OR current_game_name != '-')
	`, time.Now())

	if tx.Error != nil {
		LogCron("ERROR", "[Cleanup] Gagal mereset status teman yatim: %v", tx.Error)
	} else if tx.RowsAffected > 0 {
		LogCron("INFO", "[Cleanup] Berhasil mereset status %d teman yatim yang sudah tidak aktif dilacak.", tx.RowsAffected)
	}
}
