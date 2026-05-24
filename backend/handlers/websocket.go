package handlers

import (
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

// UpgradeWebSocket handles checking upgrade requirements and validating the JWT token
func UpgradeWebSocket(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		token := c.Query("token")
		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Token is required for WebSocket connection"})
		}

		userID, username, _, _, err := services.ParseTokenString(token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token: " + err.Error()})
		}

		c.Locals("ws_user_id", userID)
		c.Locals("ws_username", username)
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

// HandleWebSocket manages the lifetime of a connected websocket client
func HandleWebSocket() fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		userIDVal := c.Locals("ws_user_id")
		usernameVal := c.Locals("ws_username")

		userID, ok1 := userIDVal.(uint)
		username, ok2 := usernameVal.(string)

		if !ok1 || !ok2 {
			c.Close()
			return
		}

		client := &services.WSClient{
			Conn:     c,
			UserID:   userID,
			Username: username,
		}

		services.Hub.RegisterClient(client)
		defer services.Hub.UnregisterClient(client)

		// Read loop to detect disconnects
		for {
			_, _, err := c.ReadMessage()
			if err != nil {
				// Client disconnected
				break
			}
		}
	})
}
