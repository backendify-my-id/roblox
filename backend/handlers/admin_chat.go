package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"strconv"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/apany/roblox-friend-tracker/utils"
	"github.com/gofiber/fiber/v2"
)

// ==========================================
// SHARED UTILITY HELPERS
// ==========================================

// getDecryptedCookieAndUser verifies admin permissions, retrieves the user, and decrypts their Roblox cookie.
func getDecryptedCookieAndUser(c *fiber.Ctx) (string, *models.User, error) {
	role, _ := c.Locals("role").(string)
	if role != "admin" {
		return "", nil, fiber.NewError(fiber.StatusForbidden, "Hanya admin yang dapat memantau chat")
	}

	userIDStr := c.Query("user_id")
	if userIDStr == "" {
		return "", nil, fiber.NewError(fiber.StatusBadRequest, "user_id is required")
	}

	userID, err := strconv.ParseUint(userIDStr, 10, 64)
	if err != nil {
		return "", nil, fiber.NewError(fiber.StatusBadRequest, "invalid user_id")
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return "", nil, fiber.NewError(fiber.StatusNotFound, "User tidak ditemukan")
	}

	if user.RobloxCookie == "" {
		return "", nil, fiber.NewError(fiber.StatusBadRequest, "User tidak memiliki cookie")
	}

	decryptedCookie, err := utils.Decrypt(user.RobloxCookie)
	if err != nil || decryptedCookie == "" {
		return "", nil, fiber.NewError(fiber.StatusInternalServerError, "Gagal mendekripsi cookie")
	}

	return decryptedCookie, &user, nil
}

// ==========================================
// HTTP HANDLERS
// ==========================================

// GetChatUsers lists all registered users who have inputted cookies
func GetChatUsers(c *fiber.Ctx) error {
	role, _ := c.Locals("role").(string)
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Hanya admin yang dapat memantau chat"})
	}

	var users []models.User
	err := database.DB.Where("roblox_cookie != ''").Order("roblox_username asc").Find(&users).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal mengambil daftar pengguna"})
	}

	type UserInfo struct {
		ID                uint   `json:"id"`
		RobloxUserID      string `json:"roblox_user_id"`
		RobloxUsername    string `json:"roblox_username"`
		RobloxDisplayName string `json:"roblox_display_name"`
		AvatarURL         string `json:"avatar_url"`
	}

	res := make([]UserInfo, len(users))
	for i, u := range users {
		res[i] = UserInfo{
			ID:                u.ID,
			RobloxUserID:      u.RobloxUserID,
			RobloxUsername:    u.RobloxUsername,
			RobloxDisplayName: u.RobloxDisplayName,
			AvatarURL:         u.AvatarURL,
		}
	}

	return c.JSON(res)
}

// GetUserConversations returns user conversations from the local database.
// Fallback: If no conversations exist in the local database, it fetches from Roblox API and caches them.
func GetUserConversations(c *fiber.Ctx) error {
	decryptedCookie, user, err := getDecryptedCookieAndUser(c)
	if err != nil {
		if fiberErr, ok := err.(*fiber.Error); ok {
			return c.Status(fiberErr.Code).JSON(fiber.Map{"error": fiberErr.Message})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	robloxUserID, err := strconv.ParseUint(user.RobloxUserID, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user roblox_user_id"})
	}

	// 1. Check if we have participants (and hence conversations) for this user in DB
	var participantRecords []models.RobloxConversationParticipant
	database.DB.Where("roblox_user_id = ?", robloxUserID).Find(&participantRecords)

	if len(participantRecords) > 0 {
		var convIDs []string
		for _, p := range participantRecords {
			convIDs = append(convIDs, p.ConversationID)
		}

		var dbConvs []models.RobloxConversation
		if err := database.DB.Where("id IN ?", convIDs).Order("last_updated desc").Find(&dbConvs).Error; err == nil && len(dbConvs) > 0 {
			conversationsRes := make([]services.RobloxConversationResponse, len(dbConvs))
			for i, dbConv := range dbConvs {
				var parts []models.RobloxConversationParticipant
				database.DB.Where("conversation_id = ?", dbConv.ID).Find(&parts)

				partIDs := make([]uint64, len(parts))
				userDataMap := make(map[string]services.RobloxUserData)
				for j, p := range parts {
					partIDs[j] = p.RobloxUserID
					pKey := strconv.FormatUint(p.RobloxUserID, 10)
					userDataMap[pKey] = services.RobloxUserData{
						ID:           p.RobloxUserID,
						Name:         p.Username,
						DisplayName:  p.DisplayName,
						CombinedName: p.DisplayName,
					}
				}

				conversationName := dbConv.Name
				// For 1-on-1 chats, always show the OTHER participant's name, not whoever
				// happened to sync last (which could overwrite with the current user's own name).
				if dbConv.Type == "one_to_one" {
					for _, p := range parts {
						if p.RobloxUserID != robloxUserID {
							name := p.DisplayName
							if name == "" {
								name = p.Username
							}
							if name != "" {
								conversationName = name
							}
							break
						}
					}
				}

				conversationsRes[i] = services.RobloxConversationResponse{
					ID:                 dbConv.ID,
					Type:               dbConv.Type,
					Name:               conversationName,
					CreatedBy:          dbConv.CreatedBy,
					ParticipantUserIDs: partIDs,
					UserData:           userDataMap,
					LastUpdated:        dbConv.LastUpdated,
				}
			}

			return c.JSON(services.RobloxGetConversationsResponse{
				Conversations: conversationsRes,
			})
		}
	}

	// 2. Fallback: fetch from Roblox API
	targetURL := "https://apis.roblox.com/platform-chat-api/v1/get-user-conversations?page_size=100&include_user_data=true"
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	req.Header.Set("Cookie", decryptedCookie)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if resp.StatusCode == http.StatusOK {
		var responseData services.RobloxGetConversationsResponse
		if err := json.Unmarshal(bodyBytes, &responseData); err == nil {
			services.SyncConversationsToDB(responseData.Conversations)
		}
	}

	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(bodyBytes)
}

// SyncAllUserChats triggers a full background crawler to sync all chat messages for a user
func SyncAllUserChats(c *fiber.Ctx) error {
	decryptedCookie, user, err := getDecryptedCookieAndUser(c)
	if err != nil {
		if fiberErr, ok := err.(*fiber.Error); ok {
			return c.Status(fiberErr.Code).JSON(fiber.Map{"error": fiberErr.Message})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Trigger async full sync
	go services.PerformFullChatSync(decryptedCookie, uint64(user.ID))

	return c.JSON(fiber.Map{
		"status":  "success",
		"message": "Penyelarasan riwayat chat penuh sedang berjalan di latar belakang.",
	})
}

// GetConversationMessages returns conversation messages from the local database.
// Fallback: If no messages exist in the local database, it fetches from Roblox API and caches them.
func GetConversationMessages(c *fiber.Ctx) error {
	decryptedCookie, _, err := getDecryptedCookieAndUser(c)
	if err != nil {
		if fiberErr, ok := err.(*fiber.Error); ok {
			return c.Status(fiberErr.Code).JSON(fiber.Map{"error": fiberErr.Message})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	conversationID := c.Query("conversation_id")
	if conversationID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "conversation_id is required"})
	}

	cursor := c.Query("cursor")

	// 1. Check if we have messages for this conversation in DB
	var totalCount int64
	database.DB.Model(&models.RobloxChatMessage{}).Where("conversation_id = ?", conversationID).Count(&totalCount)

	if totalCount > 0 {
		var dbMsgs []models.RobloxChatMessage
		dbQuery := database.DB.Where("conversation_id = ?", conversationID).Order("created_at desc")

		// Handle pagination cursor (represents the ID of the oldest message in previous batch)
		if cursor != "" {
			var cursorMsg models.RobloxChatMessage
			if err := database.DB.Where("id = ?", cursor).First(&cursorMsg).Error; err == nil {
				dbQuery = dbQuery.Where("created_at < ?", cursorMsg.CreatedAt)
			}
		}

		if err := dbQuery.Limit(50).Find(&dbMsgs).Error; err == nil {
			msgsRes := make([]services.RobloxMessageResponse, len(dbMsgs))
			for i, m := range dbMsgs {
				var senderUID *uint64
				if m.SenderUserID != nil {
					val := *m.SenderUserID
					senderUID = &val
				}

				msgsRes[i] = services.RobloxMessageResponse{
					ID:             m.ID,
					Content:        m.Content,
					SenderUserID:   senderUID,
					CreatedAt:      m.CreatedAt,
					ModerationType: m.ModerationType,
					Type:           m.Type,
					IsDeleted:      m.IsDeleted,
				}
			}

			nextCursorVal := ""
			if len(dbMsgs) == 50 {
				nextCursorVal = dbMsgs[len(dbMsgs)-1].ID
			}

			return c.JSON(services.RobloxGetMessagesResponse{
				Messages:       msgsRes,
				NextCursor:     nextCursorVal,
				PreviousCursor: "",
			})
		}
	}

	// 2. Fallback: fetch from Roblox API (only for real UUID conversation IDs)
	// Synthetic IDs (friend-xxx-yyy) are generated locally and are not valid on Roblox API.
	// If no messages are found in DB for them, it simply means no chat history exists yet.
	if strings.HasPrefix(conversationID, "friend-") {
		return c.JSON(services.RobloxGetMessagesResponse{
			Messages:       []services.RobloxMessageResponse{},
			NextCursor:     "",
			PreviousCursor: "",
		})
	}

	targetURL := fmt.Sprintf("https://apis.roblox.com/platform-chat-api/v1/get-conversation-messages?conversation_id=%s&pageSize=50", conversationID)
	if cursor != "" {
		targetURL = fmt.Sprintf("%s&cursor=%s", targetURL, url.QueryEscape(cursor))
	}
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	req.Header.Set("Cookie", decryptedCookie)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if resp.StatusCode == http.StatusOK {
		var responseData services.RobloxGetMessagesResponse
		if err := json.Unmarshal(bodyBytes, &responseData); err == nil {
			services.SyncMessagesToDB(conversationID, responseData.Messages)
		}
	}

	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(bodyBytes)
}

// DebugChatDB is a temporary endpoint to inspect the chat database content
func DebugChatDB(c *fiber.Ctx) error {
	var users []models.User
	database.DB.Find(&users)

	type UserD struct {
		ID             uint   `json:"id"`
		RobloxUsername string `json:"roblox_username"`
		RobloxUserID   string `json:"roblox_user_id"`
	}
	uD := make([]UserD, len(users))
	for i, u := range users {
		uD[i] = UserD{ID: u.ID, RobloxUsername: u.RobloxUsername, RobloxUserID: u.RobloxUserID}
	}

	var parts []models.RobloxConversationParticipant
	database.DB.Limit(100).Find(&parts)

	var convs []models.RobloxConversation
	database.DB.Limit(100).Find(&convs)

	return c.JSON(fiber.Map{
		"users":         uD,
		"participants":  parts,
		"conversations": convs,
	})
}
