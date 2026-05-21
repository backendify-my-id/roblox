package cron

import (
	"fmt"
	"log"
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
	log.Println("Cron jobs started")
}

func syncAllFriends() {
	lockKey := "lock:friends_sync"
	// Try to acquire lock with 14 minutes expiration (since job runs every 15 mins)
	acquired, err := cache.RDB.SetNX(cache.Ctx, lockKey, "locked", 14*time.Minute).Result()
	if err != nil {
		log.Println("[FriendsSync] Error acquiring Redis lock:", err)
		return
	}
	if !acquired {
		log.Println("[FriendsSync] Skipped: another instance is running the sync")
		return
	}
	defer cache.RDB.Del(cache.Ctx, lockKey)

	log.Println("Starting 15-minute friends & profile sync...")
	var users []models.User
	// Only sync friends for registered users (those who have a role)
	if err := database.DB.Where("role_id IS NOT NULL").Find(&users).Error; err != nil {
		log.Println("Error fetching users for friend sync:", err)
		return
	}

	for _, user := range users {
		checkKey := fmt.Sprintf("last_name_check:%d", user.ID)
		checkNames := false
		
		_, err := cache.RDB.Get(cache.Ctx, checkKey).Result()
		if err != nil { // key doesn't exist or expired
			checkNames = true
		}
		
		if err := services.SyncUserFriends(user.ID, user.RobloxUserID, checkNames); err != nil {
			log.Printf("Error syncing friends for user %s: %v\n", user.RobloxUsername, err)
		} else if checkNames {
			// Update the check time on success with a 1-hour TTL
			cache.RDB.Set(cache.Ctx, checkKey, "done", 1*time.Hour)
		}
	}
	log.Println("15-minute friends & profile sync completed")
}

func syncAllPresences() {
	lockKey := "lock:presence_sync"
	// Try to acquire lock with 4 minutes expiration (since job runs every 5 mins)
	acquired, err := cache.RDB.SetNX(cache.Ctx, lockKey, "locked", 4*time.Minute).Result()
	if err != nil {
		log.Println("[PresenceSync] Error acquiring Redis lock:", err)
		return
	}
	if !acquired {
		log.Println("[PresenceSync] Skipped: another instance is running the sync")
		return
	}
	defer cache.RDB.Del(cache.Ctx, lockKey)

	log.Println("Starting 5-minute presence sync...")
	var friends []models.Friend
	if err := database.DB.Preload("TargetUser").Where("status = ?", "active").Find(&friends).Error; err != nil {
		log.Println("Error fetching active friends for presence sync:", err)
		return
	}

	if len(friends) == 0 {
		return
	}

	// Get all stealth users and their exemptions
	var stealthUsers []models.User
	database.DB.Preload("StealthExempts").Where("is_stealth = ?", true).Find(&stealthUsers)
	
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
		log.Printf("[Stealth] Active stealth users: %d\n", len(stealthMap))
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

	// Batch into max 100 per request
	batchSize := 100
	presenceMap := make(map[uint64]services.PresenceData)

	for i := 0; i < len(uniqueIDs); i += batchSize {
		end := i + batchSize
		if end > len(uniqueIDs) {
			end = len(uniqueIDs)
		}
		batch := uniqueIDs[i:end]

		pData, err := services.GetPresences(batch)
		if err != nil {
			log.Printf("Error fetching presences for batch: %v\n", err)
			continue
		}

		for k, v := range pData {
			presenceMap[k] = v
		}
	}

	// Track updated user IDs to prevent duplicate logs/updates for the same user targeted by multiple people
	updatedUserIDs := make(map[uint]bool)

	// Update friends and log activities
	for _, f := range friends {
		if updatedUserIDs[f.TargetUser.ID] {
			continue // Already processed this user in this sync run
		}

		rID, err := strconv.ParseUint(f.TargetUser.RobloxUserID, 10, 64)
		if err != nil {
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
				log.Printf("[Activity] %s is now %s (%s)\n", f.TargetUser.RobloxUsername, statusStr, p.LastLocation)

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
								log.Printf("[AutoMap] Updated map name for UniverseID %d: %s -> %s\n", *p.UniverseId, oldName, p.LastLocation)
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
								} else {
									log.Printf("[AutoMap] Failed to fetch details for UniverseID %d: %v\n", *p.UniverseId, err)
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
								} else {
									log.Printf("[AutoMap] Failed to fetch details for UniverseID %d: %v\n", *p.UniverseId, err)
								}
								nameMap.UniverseID = p.UniverseId
								nameMap.PlaceID = resolvedPlaceID
								nameMap.UpdatedAt = time.Now()
								database.DB.Save(&nameMap)
								log.Printf("[AutoMap] Linked UniverseID %d and PlaceID %d to manual map: %s\n", *p.UniverseId, *resolvedPlaceID, p.LastLocation)
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
								} else {
									log.Printf("[AutoMap] Failed to fetch details for new UniverseID %d: %v\n", *p.UniverseId, err)
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
									log.Printf("[AutoMap] Added brand new map with UniverseID %d: %s\n", *p.UniverseId, p.LastLocation)
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
								log.Printf("[AutoMap] Added new map (fallback) to database: %s\n", p.LastLocation)
							}
						}
					}
				}
				
				updatedUserIDs[f.TargetUser.ID] = true
			}
		}
	}
	log.Println("5-minute presence sync completed")
}
