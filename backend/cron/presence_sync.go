package cron

import (
	"log"
	"strconv"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/robfig/cron/v3"
)

var c *cron.Cron

func StartPresenceSync() {
	c = cron.New()

	// Interval: every 2 minutes
	_, err := c.AddFunc("*/1 * * * *", syncPresence)
	if err != nil {
		log.Fatalf("Error scheduling cron job: %v", err)
	}

	c.Start()
	log.Println("Background Presence Sync Cron Job started (every 1 minutes)")
}

func syncPresence() {
	var friends []models.TrackedFriend
	if err := database.DB.Find(&friends).Error; err != nil {
		log.Println("Cron failed to fetch friends: ", err)
		return
	}

	if len(friends) == 0 {
		return
	}

	var userIds []uint
	for _, f := range friends {
		uid, _ := strconv.ParseUint(f.RobloxUserID, 10, 64)
		userIds = append(userIds, uint(uid))
	}

	presences, err := services.GetUsersPresence(userIds)
	if err != nil {
		log.Println("Cron failed to fetch presence API: ", err)
		return
	}

	presenceMap := make(map[uint]services.PresenceData)
	for _, p := range presences {
		presenceMap[p.UserId] = p
	}

	for _, f := range friends {
		uid, _ := strconv.ParseUint(f.RobloxUserID, 10, 64)
		p, exists := presenceMap[uint(uid)]

		if exists {
			s, ok := services.PresenceTypeMap[p.UserPresenceType]
			if ok {
				f.LastStatus = s
			}

			if p.UserPresenceType == 2 { // In-Game
				loc := p.LastLocation
				f.LastPlayedGame = &loc
			}

			if p.LastLocation != "" {
				loc := p.LastLocation
				f.PresenceLocation = &loc
			}

			database.DB.Save(&f)
		}
	}
	log.Printf("Cron sync completed for %d users.\n", len(friends))
}
