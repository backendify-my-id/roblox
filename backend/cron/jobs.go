package cron

import (
	"log"
	"strconv"
	"sync"

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
		if err := services.SyncUserFriends(user.ID, user.RobloxUserID); err != nil {
			log.Printf("Error syncing friends for user %s: %v\n", user.RobloxUsername, err)
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
			}
		}
	}
	log.Println("5-minute presence sync completed")
}
