package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
)

// --- Types ---

type UsernameResponse struct {
	Data []struct {
		Id          uint64 `json:"id"`
		Name        string `json:"name"`
		DisplayName string `json:"displayName"`
	} `json:"data"`
}

type FriendData struct {
	Id          uint64 `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type FriendsResponse struct {
	Data []FriendData `json:"data"`
}

type AvatarResponse struct {
	Data []struct {
		TargetId uint64 `json:"targetId"`
		ImageUrl string `json:"imageUrl"`
	} `json:"data"`
}

type PresenceData struct {
	UserId           uint64 `json:"userId"`
	UserPresenceType int    `json:"userPresenceType"` // 0: Offline, 1: Online, 2: InGame, 3: InStudio, 4: Invisible
	LastLocation     string `json:"lastLocation"`
}

type PresenceResponse struct {
	UserPresences []PresenceData `json:"userPresences"`
}

type UserDetailData struct {
	Id          uint64 `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type UserDetailsResponse struct {
	Data []UserDetailData `json:"data"`
}

// --- Functions ---

func ValidateUsername(username string) (uint64, string, string, error) {
	url := "https://users.roblox.com/v1/usernames/users"
	payload := map[string]interface{}{
		"usernames":          []string{username},
		"excludeBannedUsers": true,
	}
	body, _ := json.Marshal(payload)

	waitForRateLimit()
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return 0, "", "", err
	}
	defer resp.Body.Close()

	var res UsernameResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return 0, "", "", err
	}

	if len(res.Data) == 0 {
		return 0, "", "", fmt.Errorf("user not found")
	}

	return res.Data[0].Id, res.Data[0].Name, res.Data[0].DisplayName, nil
}

// GetUserDetails fetches name/displayName for a batch of user IDs via POST https://users.roblox.com/v1/users
func GetUserDetails(userIds []uint64) (map[uint64]UserDetailData, error) {
	result := make(map[uint64]UserDetailData)
	if len(userIds) == 0 {
		return result, nil
	}

	var missingIds []uint64
	for _, id := range userIds {
		key := fmt.Sprintf("user_detail:%d", id)
		val, err := cache.RDB.Get(cache.Ctx, key).Result()
		if err == nil {
			var data UserDetailData
			if err := json.Unmarshal([]byte(val), &data); err == nil {
				result[id] = data
				continue
			}
		}
		missingIds = append(missingIds, id)
	}

	if len(missingIds) == 0 {
		return result, nil
	}

	// Batch max 100 per request
	batchSize := 100
	for i := 0; i < len(missingIds); i += batchSize {
		end := i + batchSize
		if end > len(missingIds) {
			end = len(missingIds)
		}
		batch := missingIds[i:end]

		payload := map[string]interface{}{
			"userIds":            batch,
			"excludeBannedUsers": false,
		}
		body, _ := json.Marshal(payload)

		waitForRateLimit()
		resp, err := http.Post("https://users.roblox.com/v1/users", "application/json", bytes.NewBuffer(body))
		if err != nil {
			log.Printf("[GetUserDetails] HTTP error for batch: %v", err)
			continue
		}

		if resp.StatusCode != 200 {
			resp.Body.Close()
			log.Printf("[GetUserDetails] API returned %d for batch", resp.StatusCode)
			continue
		}

		var res UserDetailsResponse
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			resp.Body.Close()
			log.Printf("[GetUserDetails] Decode error: %v", err)
			continue
		}
		resp.Body.Close()

		for _, u := range res.Data {
			result[u.Id] = u
			// Cache for 24 hours
			uJson, _ := json.Marshal(u)
			cache.RDB.Set(cache.Ctx, fmt.Sprintf("user_detail:%d", u.Id), string(uJson), 24*time.Hour)
		}
	}

	return result, nil
}

func GetFriends(userId uint64) ([]FriendData, error) {
	url := fmt.Sprintf("https://friends.roblox.com/v1/users/%d/friends", userId)
	waitForRateLimit()
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("failed to fetch friends: %d", resp.StatusCode)
	}

	var res FriendsResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	// Enrich with name/displayName from users API
	var ids []uint64
	for _, f := range res.Data {
		if f.Name == "" {
			ids = append(ids, f.Id)
		}
	}

	if len(ids) > 0 {
		details, err := GetUserDetails(ids)
		if err == nil {
			for i, f := range res.Data {
				if d, ok := details[f.Id]; ok {
					res.Data[i].Name = d.Name
					res.Data[i].DisplayName = d.DisplayName
				}
			}
		}
	}

	return res.Data, nil
}

func GetAvatars(userIds []uint64) (map[uint64]string, error) {
	result := make(map[uint64]string)
	if len(userIds) == 0 {
		return result, nil
	}

	var missingIds []uint64
	for _, id := range userIds {
		key := fmt.Sprintf("avatar:%d", id)
		val, err := cache.RDB.Get(cache.Ctx, key).Result()
		if err == nil && val != "" {
			result[id] = val
			continue
		}
		missingIds = append(missingIds, id)
	}

	if len(missingIds) == 0 {
		return result, nil
	}

	// Batch request max 100
	idStrs := make([]string, len(missingIds))
	for i, id := range missingIds {
		idStrs[i] = fmt.Sprintf("%d", id)
	}

	url := fmt.Sprintf("https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=%s&size=150x150&format=Png&isCircular=false", strings.Join(idStrs, ","))
	waitForRateLimit()
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to fetch avatars: %d, %s", resp.StatusCode, string(b))
	}

	var res AvatarResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	for _, d := range res.Data {
		result[d.TargetId] = d.ImageUrl
		// Cache for 6 hours
		cache.RDB.Set(cache.Ctx, fmt.Sprintf("avatar:%d", d.TargetId), d.ImageUrl, 6*time.Hour)
	}

	return result, nil
}

func GetPresences(userIds []uint64) (map[uint64]PresenceData, error) {
	if len(userIds) == 0 {
		return make(map[uint64]PresenceData), nil
	}

	apiUrl := "https://presence.roblox.com/v1/presence/users"
	payload := map[string]interface{}{
		"userIds": userIds,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", apiUrl, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	cookie := os.Getenv("ROBLOSECURITY")
	if cookie != "" {
		req.Header.Set("Cookie", ".ROBLOSECURITY="+cookie)
	}

	waitForRateLimit()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("failed to fetch presence: %d", resp.StatusCode)
	}

	var res PresenceResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	presenceMap := make(map[uint64]PresenceData)
	for _, p := range res.UserPresences {
		presenceMap[p.UserId] = p
	}

	return presenceMap, nil
}
