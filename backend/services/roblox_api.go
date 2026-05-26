package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/apany/roblox-friend-tracker/utils"
	"github.com/google/uuid"
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
	UserId           uint64  `json:"userId"`
	UserPresenceType int     `json:"userPresenceType"` // 0: Offline, 1: Online, 2: InGame, 3: InStudio, 4: Invisible
	LastLocation     string  `json:"lastLocation"`
	PlaceId          *uint64 `json:"placeId,omitempty"`
	UniverseId       *uint64 `json:"universeId,omitempty"`
	GameId           string  `json:"gameId,omitempty"`
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

	// Batch max 100 per request
	batchSize := 100
	for i := 0; i < len(userIds); i += batchSize {
		end := i + batchSize
		if end > len(userIds) {
			end = len(userIds)
		}
		batch := userIds[i:end]

		payload := map[string]interface{}{
			"userIds":            batch,
			"excludeBannedUsers": false,
		}
		body, _ := json.Marshal(payload)

		waitForRateLimit()
		resp, err := http.Post("https://users.roblox.com/v1/users", "application/json", bytes.NewBuffer(body))
		if err != nil {
			utils.LogCron("ERROR", "[GetUserDetails] HTTP error for batch: %v", err)
			continue
		}

		if resp.StatusCode != 200 {
			resp.Body.Close()
			utils.LogCron("ERROR", "[GetUserDetails] API returned %d for batch", resp.StatusCode)
			continue
		}

		var res UserDetailsResponse
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			resp.Body.Close()
			utils.LogCron("ERROR", "[GetUserDetails] Decode error: %v", err)
			continue
		}
		resp.Body.Close()

		for _, u := range res.Data {
			result[u.Id] = u
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

	return res.Data, nil
}

func GetAvatars(userIds []uint64) (map[uint64]string, error) {
	avatarMap := make(map[uint64]string)
	if len(userIds) == 0 {
		return avatarMap, nil
	}

	batchSize := 100
	for i := 0; i < len(userIds); i += batchSize {
		end := i + batchSize
		if end > len(userIds) {
			end = len(userIds)
		}
		batch := userIds[i:end]

		idStrs := make([]string, len(batch))
		for idx, id := range batch {
			idStrs[idx] = fmt.Sprintf("%d", id)
		}

		url := fmt.Sprintf("https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=%s&size=150x150&format=Png&isCircular=false", strings.Join(idStrs, ","))
		waitForRateLimit()
		resp, err := http.Get(url)
		if err != nil {
			utils.LogCron("ERROR", "[GetAvatars] HTTP error for batch: %v", err)
			continue
		}

		if resp.StatusCode != 200 {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			utils.LogCron("ERROR", "[GetAvatars] API returned %d for batch: %s", resp.StatusCode, string(b))
			continue
		}

		var res AvatarResponse
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			resp.Body.Close()
			utils.LogCron("ERROR", "[GetAvatars] Decode error: %v", err)
			continue
		}
		resp.Body.Close()

		for _, d := range res.Data {
			avatarMap[d.TargetId] = d.ImageUrl
		}
	}

	return avatarMap, nil
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

type OmniSearchResult struct {
	UniverseID  uint64 `json:"universe_id"`
	RootPlaceID uint64 `json:"root_place_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	UrlPath     string `json:"url_path"`
}

type OmniSearchResponse struct {
	SearchResults []struct {
		ContentGroupType string `json:"contentGroupType"`
		Contents         []struct {
			UniverseId       uint64 `json:"universeId"`
			Name             string `json:"name"`
			Description      string `json:"description"`
			RootPlaceId      uint64 `json:"rootPlaceId"`
			CanonicalUrlPath string `json:"canonicalUrlPath"`
			ContentType      string `json:"contentType"`
		} `json:"contents"`
	} `json:"searchResults"`
}

func SearchRobloxGames(searchQuery string) ([]OmniSearchResult, error) {
	sessionID := uuid.New().String()
	encodedQuery := url.QueryEscape(searchQuery)
	targetURL := fmt.Sprintf("https://apis.roblox.com/search-api/omni-search?searchQuery=%s&sessionId=%s&pageType=all", encodedQuery, sessionID)

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, err
	}

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
		return nil, fmt.Errorf("omni-search returned status: %d", resp.StatusCode)
	}

	var res OmniSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	var results []OmniSearchResult
	for _, r := range res.SearchResults {
		for _, c := range r.Contents {
			if c.ContentType == "Game" || r.ContentGroupType == "Game" {
				results = append(results, OmniSearchResult{
					UniverseID:  c.UniverseId,
					RootPlaceID: c.RootPlaceId,
					Name:        c.Name,
					Description: c.Description,
					UrlPath:     c.CanonicalUrlPath,
				})
			}
		}
	}

	return results, nil
}

type UniverseDetailsResponse struct {
	Data []struct {
		ID          uint64 `json:"id"`
		RootPlaceId uint64 `json:"rootPlaceId"`
		Name        string `json:"name"`
		Description string `json:"description"`
	} `json:"data"`
}

func GetUniverseDetails(universeID uint64) (string, string, uint64, error) {
	targetURL := fmt.Sprintf("https://games.roblox.com/v1/games?universeIds=%d", universeID)

	waitForRateLimit()
	resp, err := http.Get(targetURL)
	if err != nil {
		return "", "", 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", "", 0, fmt.Errorf("games-api returned status: %d", resp.StatusCode)
	}

	var res UniverseDetailsResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", "", 0, err
	}

	if len(res.Data) == 0 {
		return "", "", 0, fmt.Errorf("no details found for universe: %d", universeID)
	}

	return res.Data[0].Name, res.Data[0].Description, res.Data[0].RootPlaceId, nil
}

func GetUniverseIDFromPlaceID(placeID uint64) (uint64, error) {
	targetURL := fmt.Sprintf("https://apis.roblox.com/universes/v1/places/%d/universe", placeID)
	waitForRateLimit()
	resp, err := http.Get(targetURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return 0, fmt.Errorf("universes-api returned status: %d", resp.StatusCode)
	}

	var res struct {
		UniverseID uint64 `json:"universeId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return 0, err
	}

	return res.UniverseID, nil
}
