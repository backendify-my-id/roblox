package cron

import (
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/robfig/cron/v3"
)

// Guards to prevent overlapping sync jobs
var (
	friendsSyncRunning  sync.Mutex
	presenceSyncRunning sync.Mutex
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
	if !friendsSyncRunning.TryLock() {
		log.Println("[FriendsSync] Skipped: previous sync still running")
		return
	}
	defer friendsSyncRunning.Unlock()

	log.Println("Starting 15-minute friends & profile sync...")
	var users []models.User
	if err := database.DB.Find(&users).Error; err != nil {
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
	if !presenceSyncRunning.TryLock() {
		log.Println("[PresenceSync] Skipped: previous sync still running")
		return
	}
	defer presenceSyncRunning.Unlock()

	log.Println("Starting 5-minute presence sync...")
	var friends []models.Friend
	if err := database.DB.Where("status = ?", "active").Find(&friends).Error; err != nil {
		log.Println("Error fetching active friends for presence sync:", err)
		return
	}

	if len(friends) == 0 {
		return
	}

	// Get all stealth users to exclude them from online display
	var stealthRobloxIDs []string
	database.DB.Model(&models.User{}).Where("is_stealth = ?", true).Pluck("roblox_user_id", &stealthRobloxIDs)
	stealthMap := make(map[string]bool)
	for _, id := range stealthRobloxIDs {
		stealthMap[id] = true
	}
	if len(stealthRobloxIDs) > 0 {
		log.Printf("[Stealth] Active stealth IDs: %v\n", stealthRobloxIDs)
	}

	// Deduplicate roblox IDs to minimize API calls
	idMap := make(map[uint64]bool)
	var uniqueIDs []uint64
	for _, f := range friends {
		rID, err := strconv.ParseUint(f.FriendRobloxID, 10, 64)
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

	// Update friends and log activities
	for _, f := range friends {
		rID, err := strconv.ParseUint(f.FriendRobloxID, 10, 64)
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

			// Force Offline if user is in Stealth Mode
			if stealthMap[f.FriendRobloxID] {
				statusStr = "Offline"
				p.LastLocation = ""
			}

			if f.CurrentPresence != statusStr || f.CurrentGameName != p.LastLocation {
				// Status changed, log it
				f.CurrentPresence = statusStr
				f.CurrentGameName = p.LastLocation
				database.DB.Save(&f)

				newLog := models.ActivityLog{
					FriendID: f.ID,
					Status:   statusStr,
					GameName: p.LastLocation,
				}
				database.DB.Create(&newLog)
				log.Printf("[Activity] %s is now %s (%s)\n", f.FriendUsername, statusStr, p.LastLocation)
			}
		}
	}
	log.Println("5-minute presence sync completed")
}
