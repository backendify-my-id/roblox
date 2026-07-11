package services

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/utils"
	"github.com/gofiber/websocket/v2"
	"github.com/golang-jwt/jwt/v5"
)

type WSClient struct {
	Conn     *websocket.Conn
	UserID   uint
	Username string
	Role     string
	mu       sync.Mutex // Guard against concurrent websocket writes
}

func (client *WSClient) SafeWrite(messageType int, data []byte) error {
	client.mu.Lock()
	defer client.mu.Unlock()
	return client.Conn.WriteMessage(messageType, data)
}

type WSHub struct {
	clients    map[*WSClient]bool
	register   chan *WSClient
	unregister chan *WSClient
	broadcast  chan WSMessage
	mu         sync.RWMutex
}

type WSMessage struct {
	Type    string      `json:"type"`    // "presence_update", "profile_update", "friend_sync_complete", "log_stream", "cron_progress"
	UserID  uint        `json:"user_id"` // Target Roblox user ID in database
	Payload interface{} `json:"payload"`
}

var Hub *WSHub

func InitWSHub() {
	Hub = &WSHub{
		clients:    make(map[*WSClient]bool),
		register:   make(chan *WSClient),
		unregister: make(chan *WSClient),
		broadcast:  make(chan WSMessage),
	}
	go Hub.run()

	// Connect the global log broadcasting hook
	utils.LogBroadcastHook = func(category string, message string) {
		Hub.Broadcast(WSMessage{
			Type: "log_stream",
			Payload: map[string]string{
				"category": category,
				"message":  message,
			},
		})
	}
}

func (h *WSHub) run() {
	utils.LogStartup("[WS] Hub initialized and running")
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			utils.LogWebSocket("Client registered: User %s (ID %d, Role %s)", client.Username, client.UserID, client.Role)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.Conn.Close()
				utils.LogWebSocket("Client unregistered: User %s (ID %d)", client.Username, client.UserID)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			if message.Type == "log_stream" || message.Type == "cron_progress" {
				go h.sendToAdmins(message)
			} else {
				go h.sendToTrackers(message)
				// Broadcast presence and profile updates to all admins as well
				go h.sendToAdmins(message)
			}
		}
	}
}

func (h *WSHub) RegisterClient(client *WSClient) {
	h.register <- client
}

func (h *WSHub) UnregisterClient(client *WSClient) {
	h.unregister <- client
}

func (h *WSHub) Broadcast(msg WSMessage) {
	h.broadcast <- msg
}

func (h *WSHub) sendToTrackers(message WSMessage) {
	var friends []models.Friend
	err := database.DB.Preload("TargetUser.StealthExempts").
		Where("friend_id = ? AND status = 'active'", message.UserID).
		Find(&friends).Error

	if err != nil {
		utils.LogWebSocket("Error fetching trackers for target user %d: %v", message.UserID, err)
		return
	}

	if len(friends) == 0 {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, f := range friends {
		presence := f.TargetUser.CurrentPresence
		gameName := f.TargetUser.CurrentGameName
		gameID := f.TargetUser.CurrentGameID
		var placeID *uint64 = f.TargetUser.CurrentPlaceID

		// Evaluasi Stealth Mode
		if f.TargetUser.IsStealth {
			isExempted := false
			for _, ex := range f.TargetUser.StealthExempts {
				if ex.ID == f.UserID {
					isExempted = true
					break
				}
			}
			if !isExempted {
				presence = "Offline"
				gameName = "-"
				gameID = ""
				placeID = nil
			}
		}

		clientPayload := map[string]interface{}{
			"id":                  f.ID,
			"friend_roblox_id":    f.TargetUser.RobloxUserID,
			"friend_username":     f.TargetUser.RobloxUsername,
			"friend_display_name": f.TargetUser.RobloxDisplayName,
			"avatar_url":          f.TargetUser.AvatarURL,
			"status":              f.Status,
			"current_presence":    presence,
			"current_game_name":   gameName,
			"current_game_id":     gameID,
			"current_place_id":    placeID,
			"note":                f.Note,
			"created_at":          f.CreatedAt,
			"updated_at":          f.UpdatedAt,
		}

		clientMessage := map[string]interface{}{
			"type":      message.Type,
			"friend_id": f.TargetUser.ID,
			"payload":   clientPayload,
		}

		msgBytes, err := json.Marshal(clientMessage)
		if err != nil {
			utils.LogWebSocket("Error marshaling WS message: %v", err)
			continue
		}

		for client := range h.clients {
			if client.UserID == f.UserID {
				err := client.SafeWrite(websocket.TextMessage, msgBytes)
				if err != nil {
					utils.LogWebSocket("Error sending message to client ID %d: %v", client.UserID, err)
				}
			}
		}
	}
}

func (h *WSHub) sendToAdmins(message WSMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	msgBytes, err := json.Marshal(message)
	if err != nil {
		utils.LogWebSocket("Error marshaling Admin WS message: %v", err)
		return
	}

	adminCount := 0
	for client := range h.clients {
		if strings.ToLower(client.Role) == "admin" {
			adminCount++
			_ = client.SafeWrite(websocket.TextMessage, msgBytes)
		}
	}
	if message.Type != "log_stream" {
		utils.LogWebSocket("[WS-Admin] Sent message type '%s' to %d admin(s)", message.Type, adminCount)
	}
}

// ParseTokenString parses and validates a JWT token string
func ParseTokenString(tokenString string) (uint, string, string, string, error) {
	blacklisted, _ := cache.RDB.Get(cache.Ctx, "blacklist:"+tokenString).Result()
	if blacklisted != "" {
		return 0, "", "", "", fmt.Errorf("token blacklisted")
	}

	secret := os.Getenv("APP_SECRET")
	if secret == "" {
		secret = "86fb2b8d54096f17b9085173f4dd212e3e83dfd22c6656c406d9b876c85e8cf7"
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})

	if err != nil || !token.Valid {
		return 0, "", "", "", fmt.Errorf("invalid or expired token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, "", "", "", fmt.Errorf("invalid claims format")
	}

	var userID uint
	if uVal, ok := claims["user_id"].(float64); ok {
		userID = uint(uVal)
	} else if uVal, ok := claims["user_id"].(int); ok {
		userID = uint(uVal)
	}

	username, _ := claims["username"].(string)
	robloxID, _ := claims["roblox_id"].(string)
	role, _ := claims["role"].(string)

	return userID, username, robloxID, role, nil
}
