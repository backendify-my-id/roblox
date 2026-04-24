package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/redis/go-redis/v9"
)

type UsernameReq struct {
	Usernames          []string `json:"usernames"`
	ExcludeBannedUsers bool     `json:"excludeBannedUsers"`
}

type UsernameResp struct {
	Data []struct {
		RequestedUsername string `json:"requestedUsername"`
		Name              string `json:"name"`
		ID                uint64 `json:"id"`
	} `json:"data"`
}

func GetUserIdByUsername(username string) (uint64, string, error) {
	url := "https://users.roblox.com/v1/usernames/users"
	reqBody := UsernameReq{
		Usernames:          []string{username},
		ExcludeBannedUsers: true,
	}
	bodyData, _ := json.Marshal(reqBody)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyData))
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, "", fmt.Errorf("Roblox API returned status: %d", resp.StatusCode)
	}

	var resData UsernameResp
	err = json.NewDecoder(resp.Body).Decode(&resData)
	if err != nil {
		return 0, "", err
	}

	if len(resData.Data) == 0 {
		return 0, "", errors.New("User not found")
	}

	return resData.Data[0].ID, resData.Data[0].Name, nil
}

type PresenceReq struct {
	UserIds []uint `json:"userIds"`
}

type PresenceResp struct {
	UserPresences []PresenceData `json:"userPresences"`
}

type PresenceData struct {
	UserPresenceType int    `json:"userPresenceType"`
	LastLocation     string `json:"lastLocation"`
	PlaceId          *uint  `json:"placeId"`
	RootPlaceId      *uint  `json:"rootPlaceId"`
	UniverseId       *uint  `json:"universeId"`
	UserId           uint   `json:"userId"`
	GameId           string `json:"gameId"`
}

var PresenceTypeMap = map[int]string{
	0: "Offline",
	1: "Online",
	2: "In-Game",
	3: "In-Studio",
	4: "Invisible",
}

func GetUsersPresence(userIds []uint) ([]PresenceData, error) {
	if len(userIds) == 0 {
		return nil, nil
	}

	// To optimize, we can cache global presence or per-user.
	// For simplicity, let's cache per-user ID to avoid storing a huge single blob,
	// or just dynamically check what is missing.

	var missingIds []uint
	var results []PresenceData

	for _, id := range userIds {
		idStr := fmt.Sprintf("presence:%d", id)
		val, err := cache.RDB.Get(cache.Ctx, idStr).Result()
		if err == redis.Nil {
			missingIds = append(missingIds, id)
		} else if err != nil {
			missingIds = append(missingIds, id)
		} else {
			var pd PresenceData
			if json.Unmarshal([]byte(val), &pd) == nil {
				results = append(results, pd)
			} else {
				missingIds = append(missingIds, id)
			}
		}
	}

	if len(missingIds) == 0 {
		return results, nil
	}

	url := "https://presence.roblox.com/v1/presence/users"
	reqBody := PresenceReq{UserIds: missingIds}
	bodyData, _ := json.Marshal(reqBody)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyData))
	if err != nil {
		return results, err
	}
	req.Header.Set("Content-Type", "application/json")

	cookie := os.Getenv("ROBLOSECURITY")
	if cookie != "" {
		req.Header.Set("Cookie", ".ROBLOSECURITY="+cookie)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return results, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return results, fmt.Errorf("Presence API error: %d, %s", resp.StatusCode, string(respBody))
	}

	var resData PresenceResp
	err = json.NewDecoder(resp.Body).Decode(&resData)
	if err != nil {
		return results, err
	}

	ttlEnv := os.Getenv("REDIS_TTL")
	ttlInt := 3600
	if ttlEnv != "" {
		fmt.Sscanf(ttlEnv, "%d", &ttlInt)
	}
	ttl := time.Duration(ttlInt) * time.Second

	// Cache the missed values
	for _, pd := range resData.UserPresences {
		results = append(results, pd)
		pdBytes, _ := json.Marshal(pd)
		cache.RDB.Set(cache.Ctx, fmt.Sprintf("presence:%d", pd.UserId), string(pdBytes), ttl)
	}

	return results, nil
}
