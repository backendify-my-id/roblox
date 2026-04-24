package cron

import (
	"log"
	"strconv"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/robfig/cron/v3"
)

var friendSyncCron *cron.Cron

func StartFriendsSyncCron() {
	friendSyncCron = cron.New()

	// Every hour at minute 0
	_, err := friendSyncCron.AddFunc("0 * * * *", syncAllFriends)
	if err != nil {
		log.Fatalf("Error scheduling friends sync cron: %v", err)
	}

	friendSyncCron.Start()
	log.Println("Friends List Sync Cron started (every 1 hour)")
}

func syncAllFriends() {
	log.Println("[FriendsSync] Starting hourly friend list sync...")

	var users []models.User
	if err := database.DB.Find(&users).Error; err != nil {
		log.Printf("[FriendsSync] Failed to fetch users: %v", err)
		return
	}

	if len(users) == 0 {
		log.Println("[FriendsSync] No tracked users found, skipping.")
		return
	}

	log.Printf("[FriendsSync] Syncing friends for %d target(s)...", len(users))

	for _, user := range users {
		syncFriendsForUser(user)

		// Small delay between each user to avoid rate limiting
		time.Sleep(2 * time.Second)
	}

	log.Println("[FriendsSync] Hourly sync complete.")
}

func syncFriendsForUser(user models.User) {
	// Fetch friend IDs from Roblox
	friendIds, err := services.GetFriendsForUser(user.RobloxUserID)
	if err != nil {
		log.Printf("[FriendsSync] Failed to fetch friends for %s: %v", user.RobloxUsername, err)
		return
	}

	// Resolve names + displayNames via batch
	userDetails, _ := services.GetUserDetails(friendIds)

	// Fetch existing friends from DB
	var dbFriends []models.Friend
	database.DB.Where("user_id = ?", user.ID).Find(&dbFriends)

	dbFriendMap := make(map[string]models.Friend)
	for _, df := range dbFriends {
		dbFriendMap[df.FriendRobloxID] = df
	}

	apiFriendSet := make(map[string]bool)
	newCount, updatedCount, deletedCount := 0, 0, 0

	// Process active friends from API
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
			// Update if name changed or reactivate if previously deleted
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
				updatedCount++
			}
		} else {
			// New friend detected
			nf := models.Friend{
				UserID:            user.ID,
				FriendRobloxID:    fIdStr,
				FriendUsername:    uname,
				FriendDisplayName: dname,
			}
			database.DB.Create(&nf)
			newCount++
		}
	}

	// Mark unfriended as deleted
	for _, df := range dbFriends {
		if !apiFriendSet[df.FriendRobloxID] && !df.IsDeleted {
			df.IsDeleted = true
			database.DB.Save(&df)
			deletedCount++
		}
	}

	// Fetch missing thumbnails for any newly added friends
	database.DB.Where("user_id = ? AND avatar_url = ''", user.ID).Find(&dbFriends)
	if len(dbFriends) > 0 {
		var missingIds []uint
		for _, df := range dbFriends {
			fid, _ := strconv.ParseUint(df.FriendRobloxID, 10, 64)
			missingIds = append(missingIds, uint(fid))
		}
		thumbs, _ := services.GetAvatarThumbnails(missingIds)
		for _, df := range dbFriends {
			fid, _ := strconv.ParseUint(df.FriendRobloxID, 10, 64)
			if tUrl, ok := thumbs[uint(fid)]; ok {
				df.AvatarURL = tUrl
				database.DB.Save(&df)
			}
		}
	}

	// Update last synced timestamp
	user.LastSynced = time.Now()
	database.DB.Save(&user)

	log.Printf("[FriendsSync] %s — +%d new, ~%d updated, -%d unfriended",
		user.RobloxUsername, newCount, updatedCount, deletedCount)
}
