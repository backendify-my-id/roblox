package services

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/utils"
	"gorm.io/gorm/clause"
)

// Response Structs for JSON Parsing
type RobloxUserData struct {
	ID           uint64 `json:"id"`
	Name         string `json:"name"`
	DisplayName  string `json:"display_name"`
	CombinedName string `json:"combined_name"`
}

type RobloxConversationResponse struct {
	ID                 string                    `json:"id"`
	Type               string                    `json:"type"`
	Name               string                    `json:"name"`
	CreatedBy          uint64                    `json:"created_by"`
	ParticipantUserIDs []uint64                  `json:"participant_user_ids"`
	UserData           map[string]RobloxUserData `json:"user_data"`
	Messages           []RobloxMessageResponse   `json:"messages"`
	LastUpdated        time.Time                 `json:"updated_at"`
}

type RobloxGetConversationsResponse struct {
	Conversations []RobloxConversationResponse `json:"conversations"`
	NextCursor    string                       `json:"next_cursor"`
}

type RobloxMessageResponse struct {
	ID             string    `json:"id"`
	Content        string    `json:"content"`
	SenderUserID   *uint64   `json:"sender_user_id"`
	CreatedAt      time.Time `json:"created_at"`
	ModerationType string    `json:"moderation_type"`
	Type           string    `json:"type"`
	IsDeleted      bool      `json:"is_deleted"`
}

type RobloxGetMessagesResponse struct {
	Messages       []RobloxMessageResponse `json:"messages"`
	PreviousCursor string                  `json:"previous_cursor"`
	NextCursor     string                  `json:"next_cursor"`
}

// SyncConversationsToDB handles upserting conversations and participants into the database
func SyncConversationsToDB(convs []RobloxConversationResponse) {
	for _, c := range convs {
		convID := c.ID
		if convID == "" && len(c.ParticipantUserIDs) >= 2 {
			id1 := c.ParticipantUserIDs[0]
			id2 := c.ParticipantUserIDs[1]
			if id1 > id2 {
				id1, id2 = id2, id1
			}
			convID = fmt.Sprintf("friend-%d-%d", id1, id2)
		}

		dbConv := models.RobloxConversation{
			ID:          convID,
			Type:        c.Type,
			Name:        c.Name,
			CreatedBy:   c.CreatedBy,
			LastUpdated: c.LastUpdated,
		}
		if dbConv.LastUpdated.IsZero() {
			dbConv.LastUpdated = time.Now()
		}

		if err := database.DB.Clauses(clause.OnConflict{
			UpdateAll: true,
		}).Create(&dbConv).Error; err != nil {
			log.Printf("[ERROR] Failed to save conversation %s to DB: %v", convID, err)
		}

		for _, pID := range c.ParticipantUserIDs {
			pKey := strconv.FormatUint(pID, 10)
			pData, exists := c.UserData[pKey]

			dbPart := models.RobloxConversationParticipant{
				ConversationID: convID,
				RobloxUserID:   pID,
			}
			if exists {
				dbPart.Username = pData.Name
				dbPart.DisplayName = pData.DisplayName
				if dbPart.DisplayName == "" {
					dbPart.DisplayName = pData.CombinedName
				}
			}

			if err := database.DB.Clauses(clause.OnConflict{
				UpdateAll: true,
			}).Create(&dbPart).Error; err != nil {
				log.Printf("[ERROR] Failed to save participant %d for conv %s to DB: %v", pID, convID, err)
			}
		}

		if len(c.Messages) > 0 {
			SyncMessagesToDB(convID, c.Messages)
		}
	}
}

// SyncMessagesToDB handles upserting messages into the database with username resolution
func SyncMessagesToDB(conversationID string, msgs []RobloxMessageResponse) {
	var participants []models.RobloxConversationParticipant
	database.DB.Where("conversation_id = ?", conversationID).Find(&participants)

	partMap := make(map[uint64]models.RobloxConversationParticipant)
	for _, p := range participants {
		partMap[p.RobloxUserID] = p
	}

	for _, m := range msgs {
		dbMsg := models.RobloxChatMessage{
			ID:             m.ID,
			ConversationID: conversationID,
			Content:        m.Content,
			SenderUserID:   m.SenderUserID,
			CreatedAt:      m.CreatedAt,
			ModerationType: m.ModerationType,
			Type:           m.Type,
			IsDeleted:      m.IsDeleted,
		}

		if m.SenderUserID != nil {
			p, exists := partMap[*m.SenderUserID]
			if exists {
				dbMsg.SenderUsername = p.Username
				dbMsg.SenderDisplayName = p.DisplayName
			}
		}

		if err := database.DB.Clauses(clause.OnConflict{
			UpdateAll: true,
		}).Create(&dbMsg).Error; err != nil {
			log.Printf("[ERROR] Failed to save message %s to DB: %v", m.ID, err)
		}
	}
}

// PerformFullChatSync runs a background task to crawl and sync all conversations and messages for a user
func PerformFullChatSync(cookie string, userID uint64) {
	// Fetch user details first to log the username
	var dbUser models.User
	username := fmt.Sprintf("User #%d", userID)
	if err := database.DB.First(&dbUser, userID).Error; err == nil {
		username = dbUser.RobloxUsername
	}

	utils.LogChatSync("INFO", "Starting full chat sync for %s (DB User ID: %d)", username, userID)

	// 1. Fetch ALL conversations using cursor pagination, sync to DB as we go
	var allConversations []RobloxConversationResponse
	convCursor := ""
	convPage := 0

	for {
		convPage++
		targetURL := "https://apis.roblox.com/platform-chat-api/v1/get-user-conversations?page_size=100&include_user_data=true"
		if convCursor != "" {
			targetURL = fmt.Sprintf("%s&cursor=%s", targetURL, url.QueryEscape(convCursor))
		}

		utils.LogChatSync("INFO", "[%s] Fetching conversation list page %d...", username, convPage)

		req, err := http.NewRequest("GET", targetURL, nil)
		if err != nil {
			utils.LogChatSync("ERROR", "[%s] Failed to create conversations request (page %d): %v", username, convPage, err)
			break
		}
		req.Header.Set("Cookie", cookie)
		req.Header.Set("Accept", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			utils.LogChatSync("ERROR", "[%s] Roblox API request failed (page %d): %v", username, convPage, err)
			break
		}

		if resp.StatusCode != http.StatusOK {
			utils.LogChatSync("ERROR", "[%s] Roblox API returned non-200 status %d on conversation page %d", username, resp.StatusCode, convPage)
			resp.Body.Close()
			break
		}

		bodyBytes, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			utils.LogChatSync("ERROR", "[%s] Failed to read body (page %d): %v", username, convPage, err)
			break
		}

		var responseData RobloxGetConversationsResponse
		if err := json.Unmarshal(bodyBytes, &responseData); err != nil {
			utils.LogChatSync("ERROR", "[%s] Failed to parse conversations JSON (page %d): %v", username, convPage, err)
			break
		}

		SyncConversationsToDB(responseData.Conversations)
		allConversations = append(allConversations, responseData.Conversations...)
		utils.LogChatSync("INFO", "[%s] Page %d: fetched %d conversations (total so far: %d)", username, convPage, len(responseData.Conversations), len(allConversations))

		if responseData.NextCursor == "" {
			utils.LogChatSync("INFO", "[%s] All conversation pages fetched. Total: %d conversations.", username, len(allConversations))
			break
		}
		convCursor = responseData.NextCursor
		time.Sleep(500 * time.Millisecond)
	}

	// 2. Iterate each conversation and sync messages using pagination
	for i, conv := range allConversations {
		convID := conv.ID
		if convID == "" && len(conv.ParticipantUserIDs) >= 2 {
			id1 := conv.ParticipantUserIDs[0]
			id2 := conv.ParticipantUserIDs[1]
			if id1 > id2 {
				id1, id2 = id2, id1
			}
			convID = fmt.Sprintf("friend-%d-%d", id1, id2)
		}

		convName := conv.Name
		if convName == "" {
			convName = "Obrolan Tanpa Nama"
		}

		if conv.ID == "" {
			utils.LogChatSync("INFO", "[%s] [%d/%d] Skipping pagination for friend chat '%s' (no active conversation ID yet)", username, i+1, len(allConversations), convName)
			continue
		}

		utils.LogChatSync("INFO", "[%s] [%d/%d] Syncing message history for conversation: '%s' (ID: %s)", username, i+1, len(allConversations), convName, conv.ID)

		cursor := ""
		pageCount := 0
		totalMessagesSynced := 0

		for {
			if pageCount >= 10000 {
				utils.LogChatSync("WARNING", "[%s] [%s] Reached maximum page limit safety (10000 pages)", username, convName)
				break
			}
			pageCount++

			msgURL := fmt.Sprintf("https://apis.roblox.com/platform-chat-api/v1/get-conversation-messages?conversation_id=%s&pageSize=50", conv.ID)
			if cursor != "" {
				msgURL = fmt.Sprintf("%s&cursor=%s", msgURL, url.QueryEscape(cursor))
			}

			mReq, err := http.NewRequest("GET", msgURL, nil)
			if err != nil {
				utils.LogChatSync("ERROR", "[%s] [%s] Failed to create request: %v", username, convName, err)
				break
			}
			mReq.Header.Set("Cookie", cookie)
			mReq.Header.Set("Accept", "application/json")

			mResp, err := http.DefaultClient.Do(mReq)
			if err != nil {
				utils.LogChatSync("ERROR", "[%s] [%s] API request failed: %v", username, convName, err)
				break
			}

			if mResp.StatusCode != http.StatusOK {
				utils.LogChatSync("WARNING", "[%s] [%s] Roblox returned status %d", username, convName, mResp.StatusCode)
				mResp.Body.Close()
				break
			}

			mBodyBytes, err := io.ReadAll(mResp.Body)
			mResp.Body.Close()
			if err != nil {
				utils.LogChatSync("ERROR", "[%s] [%s] Failed to read response body: %v", username, convName, err)
				break
			}

			var mResponse RobloxGetMessagesResponse
			if err := json.Unmarshal(mBodyBytes, &mResponse); err != nil {
				utils.LogChatSync("ERROR", "[%s] [%s] Failed to parse JSON: %v", username, convName, err)
				break
			}

			SyncMessagesToDB(conv.ID, mResponse.Messages)
			totalMessagesSynced += len(mResponse.Messages)

			utils.LogChatSync("DEBUG", "[%s] [%s] Synced page %d (fetched %d messages, total: %d)", username, convName, pageCount, len(mResponse.Messages), totalMessagesSynced)

			cursorVal := mResponse.NextCursor
			if cursorVal == "" {
				// No more pages — we have reached the oldest message
				break
			}
			cursor = cursorVal

			time.Sleep(500 * time.Millisecond)
		}

		utils.LogChatSync("INFO", "[%s] [%s] Completed history sync. Total messages saved: %d across %d pages", username, convName, totalMessagesSynced, pageCount)
		time.Sleep(1000 * time.Millisecond)
	}

	utils.LogChatSync("INFO", "Finished full chat sync for %s (DB User ID: %d)", username, userID)
}

// SyncUserChatsLight fetches the first page of conversations and the latest page of messages for each conversation.
func SyncUserChatsLight(cookie string, userID uint64) error {
	targetURL := "https://apis.roblox.com/platform-chat-api/v1/get-user-conversations?page_size=50&include_user_data=true"
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Cookie", cookie)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("roblox api returned status %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var responseData RobloxGetConversationsResponse
	if err := json.Unmarshal(bodyBytes, &responseData); err != nil {
		return err
	}

	SyncConversationsToDB(responseData.Conversations)

	for _, conv := range responseData.Conversations {
		if conv.ID == "" {
			// Skip fetching history since it has no ID, the embedded messages are already saved
			continue
		}
		msgURL := fmt.Sprintf("https://apis.roblox.com/platform-chat-api/v1/get-conversation-messages?conversation_id=%s&pageSize=50", conv.ID)
		mReq, err := http.NewRequest("GET", msgURL, nil)
		if err != nil {
			log.Printf("[ChatSyncLight] Failed to create message request: %v", err)
			continue
		}
		mReq.Header.Set("Cookie", cookie)
		mReq.Header.Set("Accept", "application/json")

		mResp, err := http.DefaultClient.Do(mReq)
		if err != nil {
			log.Printf("[ChatSyncLight] Message request failed: %v", err)
			continue
		}

		if mResp.StatusCode != http.StatusOK {
			mResp.Body.Close()
			continue
		}

		mBodyBytes, err := io.ReadAll(mResp.Body)
		mResp.Body.Close()
		if err != nil {
			continue
		}

		var mResponse RobloxGetMessagesResponse
		if err := json.Unmarshal(mBodyBytes, &mResponse); err == nil {
			SyncMessagesToDB(conv.ID, mResponse.Messages)
		}

		time.Sleep(300 * time.Millisecond)
	}

	return nil
}
