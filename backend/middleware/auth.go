package middleware

import (
	"os"
	"strings"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

func Protected() fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized format"})
		}

		tokenString := parts[1]

		// Check Redis blacklist
		blacklisted, _ := cache.RDB.Get(cache.Ctx, "blacklist:"+tokenString).Result()
		if blacklisted != "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Token has been invalidated (Logged out)"})
		}
		secret := os.Getenv("APP_SECRET")
		if secret == "" {
			secret = "86fb2b8d54096f17b9085173f4dd212e3e83dfd22c6656c406d9b876c85e8cf7"
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid or expired token"})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if ok {
			c.Locals("user_id", claims["user_id"])
			c.Locals("username", claims["username"])
			c.Locals("roblox_id", claims["roblox_id"])
			c.Locals("role", claims["role"])
		}

		return c.Next()
	}
}

func RequirePermission(code string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		roleName, ok := c.Locals("role").(string)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
		}

		// Admin selalu dilewatkan (Bypass) - akses penuh, tanpa filter scope
		if roleName == "admin" {
			c.Locals("scope_friends_only", false)
			return c.Next()
		}

		userIDVal := c.Locals("user_id")
		if userIDVal == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
		}

		var user models.User
		if err := database.DB.Preload("Role.Permissions").First(&user, userIDVal).Error; err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Akses Ditolak"})
		}

		if user.RoleID == nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Akses Ditolak: Peran tidak valid"})
		}

		hasPerm := false
		scopeFriendsOnly := false
		for _, p := range user.Role.Permissions {
			if p.Code == code {
				hasPerm = true
			}
			if p.Code == "view_scope_friends_only" {
				scopeFriendsOnly = true
			}
		}

		if !hasPerm {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Forbidden: Anda tidak memiliki hak akses: " + code,
			})
		}

		// Simpan flag scope ke context agar handler dapat memfilter data
		c.Locals("scope_friends_only", scopeFriendsOnly)

		return c.Next()
	}
}
