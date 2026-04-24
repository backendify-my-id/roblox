package cron

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/redis/go-redis/v9"
	"github.com/robfig/cron/v3"
)

var c2 *cron.Cron

func StartPresenceSyncV2() {
	c2 = cron.New()

	_, err := c2.AddFunc("*/5 * * * *", syncPresenceV2)
	if err != nil {
		log.Fatalf("Error scheduling V2 cron job: %v", err)
	}

	c2.Start()
	log.Println("Background Presence Sync V2 Cron Job started (every 5 minutes)")
}

func getLivePresenceNoCache(userIds []uint) ([]services.PresenceData, error) {
	if len(userIds) == 0 {
		return nil, nil
	}

	url := "https://presence.roblox.com/v1/presence/users"
	reqBody := services.PresenceReq{UserIds: userIds}
	bodyData, _ := json.Marshal(reqBody)

	cookie := os.Getenv("ROBLOSECURITY")

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if cookie != "" {
		req.Header.Set("Cookie", ".ROBLOSECURITY="+cookie)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == 403 && resp.Header.Get("X-CSRF-TOKEN") != "" {
		csrf := resp.Header.Get("X-CSRF-TOKEN")
		resp.Body.Close()

		req, err = http.NewRequest("POST", url, bytes.NewBuffer(bodyData))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/json")
			req.Header.Set("X-CSRF-TOKEN", csrf)
			if cookie != "" {
				req.Header.Set("Cookie", ".ROBLOSECURITY="+cookie)
			}
			resp, err = client.Do(req)
		}
	}
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API failed with status %d", resp.StatusCode)
	}

	var resData services.PresenceResp
	if err := json.NewDecoder(resp.Body).Decode(&resData); err != nil {
		return nil, err
	}
	return resData.UserPresences, nil
}

func syncPresenceV2() {
	var friends []models.Friend
	if err := database.DB.Where("is_deleted = ?", false).Find(&friends).Error; err != nil {
		log.Println("Cron V2 failed to fetch friends: ", err)
		return
	}

	if len(friends) == 0 {
		return
	}

	// Build map: robloxID → []Friend (one Roblox user can be in multiple targets)
	userIds := make([]uint, 0)
	seenIds := make(map[uint]bool)
	friendMap := make(map[uint][]models.Friend) // ← slice, not single value

	for _, f := range friends {
		uid, _ := strconv.ParseUint(f.FriendRobloxID, 10, 64)
		uintId := uint(uid)
		friendMap[uintId] = append(friendMap[uintId], f)
		if !seenIds[uintId] {
			userIds = append(userIds, uintId)
			seenIds[uintId] = true
		}
	}

	// Fetch Live Presence without cache to get exact Delta
	presences, err := getLivePresenceNoCache(userIds)
	if err != nil {
		log.Println("Cron V2 failed to fetch live API: ", err)
		return
	}

	for _, p := range presences {
		friendEntries, ok := friendMap[p.UserId]
		if !ok {
			continue
		}

		statusStr := "Offline"
		if s, ok := services.PresenceTypeMap[p.UserPresenceType]; ok {
			statusStr = s
		}
		var gameName *string
		if p.UserPresenceType == 2 && p.LastLocation != "" {
			loc := p.LastLocation
			gameName = &loc
		}

		// State Delta Check with Redis (keyed by Roblox ID, shared across all targets)
		stateKey := fmt.Sprintf("state_v2:%d", p.UserId)
		lastStateVal, err := cache.RDB.Get(cache.Ctx, stateKey).Result()

		currentStateStr := statusStr
		if gameName != nil {
			currentStateStr += "|" + *gameName
		}

		if err == redis.Nil || lastStateVal != currentStateStr {
			// State changed — insert activity log for EVERY target that has this friend
			for _, friend := range friendEntries {
				logRecord := models.ActivityLog{
					FriendID: friend.ID,
					Status:   statusStr,
					GameName: gameName,
				}
				database.DB.Create(&logRecord)
			}

			// Update Redis once (state is shared, not per-target)
			cache.RDB.Set(cache.Ctx, stateKey, currentStateStr, 0)

			log.Printf("V2 LOG: %s → %s (recorded in %d target(s))\n",
				friendEntries[0].FriendUsername, currentStateStr, len(friendEntries))
		}
	}
	log.Printf("Cron V2 sync completed for %d unique users across all targets.\n", len(userIds))
}

