package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

type FriendsAPIResponse struct {
	PreviousPageCursor string `json:"previousPageCursor"`
	NextPageCursor     string `json:"nextPageCursor"`
	Data               []struct {
		ID          int64  `json:"id"`
		Name        string `json:"name"`
		DisplayName string `json:"displayName"`
	} `json:"data"`
}

// GetFriendsForUser returns a list of friend IDs from the Roblox Friends API.
// It uses pagination to ensure all friends are fetched (Roblox limit is 1000).
func GetFriendsForUser(userId string) ([]uint, error) {
	var allIds []uint
	cursor := ""

	for {
		url := fmt.Sprintf("https://friends.roblox.com/v1/users/%s/friends/find?limit=100", userId)
		if cursor != "" {
			url = fmt.Sprintf("%s&cursor=%s", url, cursor)
		}

		req, _ := http.NewRequest("GET", url, nil)
		cookie := os.Getenv("ROBLOSECURITY")
		if cookie != "" {
			req.Header.Set("Cookie", ".ROBLOSECURITY="+cookie)
		}

		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to fetch friends, status: %d", resp.StatusCode)
		}

		var parsed FriendsAPIResponse
		if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
			resp.Body.Close()
			return nil, err
		}
		resp.Body.Close()

		for _, f := range parsed.Data {
			if f.ID <= 0 {
				continue
			}
			allIds = append(allIds, uint(f.ID))
		}

		// Pagination logic
		if parsed.NextPageCursor == "" {
			break
		}
		cursor = parsed.NextPageCursor

		// Small delay to be polite to the API
		time.Sleep(100 * time.Millisecond)

		// Safety break to prevent infinite loops (max 1000 friends / 100 per page = 10 pages)
		if len(allIds) > 2000 {
			break
		}
	}

	return allIds, nil
}

type UserDetail struct {
	ID          uint   `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type UserDetailsResp struct {
	Data []UserDetail `json:"data"`
}

type UserDetailsBatchReq struct {
	UserIds            []uint `json:"userIds"`
	ExcludeBannedUsers bool   `json:"excludeBannedUsers"`
}

// GetUserDetails calls the Roblox batch users API (POST /v1/users)
// and returns map[robloxID] -> UserDetail with real name and displayName.
func GetUserDetails(userIds []uint) (map[uint]UserDetail, error) {
	result := make(map[uint]UserDetail)
	if len(userIds) == 0 {
		return result, nil
	}

	chunkSize := 100
	for i := 0; i < len(userIds); i += chunkSize {
		end := i + chunkSize
		if end > len(userIds) {
			end = len(userIds)
		}
		chunk := userIds[i:end]

		payload := UserDetailsBatchReq{
			UserIds:            chunk,
			ExcludeBannedUsers: false,
		}
		body, _ := json.Marshal(payload)

		req, err := http.NewRequest("POST", "https://users.roblox.com/v1/users", bytes.NewBuffer(body))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		cookie := os.Getenv("ROBLOSECURITY")
		if cookie != "" {
			req.Header.Set("Cookie", ".ROBLOSECURITY="+cookie)
		}

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			continue
		}

		var parsed UserDetailsResp
		json.NewDecoder(resp.Body).Decode(&parsed)
		resp.Body.Close()

		for _, u := range parsed.Data {
			result[u.ID] = u
		}
	}

	return result, nil
}

type ThumbnailResponse struct {
	Data []struct {
		TargetId uint   `json:"targetId"`
		ImageUrl string `json:"imageUrl"`
	} `json:"data"`
}

func GetAvatarThumbnails(userIds []uint) (map[uint]string, error) {
	if len(userIds) == 0 {
		return nil, nil
	}

	res := make(map[uint]string)
	chunkSize := 100 // Roblox limit per request

	for i := 0; i < len(userIds); i += chunkSize {
		end := i + chunkSize
		if end > len(userIds) {
			end = len(userIds)
		}
		chunk := userIds[i:end]

		var strIds []string
		for _, id := range chunk {
			strIds = append(strIds, fmt.Sprint(id))
		}

		url := fmt.Sprintf("https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=%s&size=150x150&format=Png&isCircular=false", strings.Join(strIds, ","))

		resp, err := http.Get(url)
		if err != nil {
			continue // Skip errors for a chunk, try others
		}

		var parsed ThumbnailResponse
		json.NewDecoder(resp.Body).Decode(&parsed)
		resp.Body.Close()

		for _, t := range parsed.Data {
			res[t.TargetId] = t.ImageUrl
		}
	}

	return res, nil
}
