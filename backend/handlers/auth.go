package handlers

import (
	"fmt"
	"log"
	"os"
	"time"

	"strings"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type AuthRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func Register(c *fiber.Ctx) error {
	if !services.GetSystemSettingBool("enable_registration", true) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Pendaftaran pengguna baru sedang ditutup oleh administrator."})
	}
	req := new(AuthRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Username == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Username and password are required"})
	}

	// Validate against Roblox API first to get the exact ID
	robloxId, correctUsername, displayName, err := services.ValidateUsername(req.Username)
	if err != nil {
		log.Printf("[Register] Validation failed for username %s: %v", req.Username, err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to validate Roblox username: " + err.Error()})
	}

	robloxIdStr := fmt.Sprintf("%d", robloxId)

	// Check if user already exists in our DB
	var existingUser models.User
	database.DB.Where("roblox_user_id = ?", robloxIdStr).First(&existingUser)

	if existingUser.ID != 0 && existingUser.RoleID != nil {
		// User exists and is already registered (has a role)
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Username already exists in database"})
	}

	// Fetch Avatar
	avatars, err := services.GetAvatars([]uint64{robloxId})
	avatarUrl := ""
	if err == nil && avatars[robloxId] != "" {
		avatarUrl = avatars[robloxId]
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	// Get default user role
	var role models.Role
	database.DB.Where("name = ?", "user").First(&role)

	// Count existing registered users to determine approval.
	// The very first registered user will be automatically approved as Admin.
	// All subsequent users require manual approval.
	var registeredCount int64
	database.DB.Model(&models.User{}).Where("password_hash != ''").Count(&registeredCount)
	isApproved := false
	if registeredCount == 0 {
		database.DB.Where("name = ?", "admin").First(&role)
		isApproved = true
	} else {
		isApproved = !services.GetSystemSettingBool("require_admin_approval", true)
	}

	if existingUser.ID != 0 {
		// User exists but was just a synced friend (no role/password).
		// We upgrade them to a full user.
		existingUser.RobloxUsername = correctUsername
		existingUser.RobloxDisplayName = displayName
		existingUser.PasswordHash = string(hashedPassword)
		existingUser.AvatarURL = avatarUrl
		existingUser.RoleID = &role.ID
		existingUser.IsApproved = isApproved

		if err := database.DB.Save(&existingUser).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to upgrade user account"})
		}
	} else {
		// Completely new user
		user := models.User{
			RobloxUserID:      robloxIdStr,
			RobloxUsername:    correctUsername,
			RobloxDisplayName: displayName,
			PasswordHash:      string(hashedPassword),
			AvatarURL:         avatarUrl,
			CreatedAt:         time.Now(),
			RoleID:            &role.ID,
			IsApproved:        isApproved,
		}

		if err := database.DB.Create(&user).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create user"})
		}
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "User registered successfully"})
}

func Login(c *fiber.Ctx) error {
	req := new(AuthRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var user models.User
	if err := database.DB.Preload("Role.Permissions").Where("LOWER(roblox_username) = LOWER(?)", req.Username).First(&user).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid credentials"})
	}

	if !user.IsApproved {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Pendaftaran Anda sedang menunggu persetujuan admin. Silakan hubungi admin."})
	}

	// Generate JWT
	secret := os.Getenv("APP_SECRET")
	if secret == "" {
		secret = "86fb2b8d54096f17b9085173f4dd212e3e83dfd22c6656c406d9b876c85e8cf7"
	}

	claims := jwt.MapClaims{
		"user_id":   user.ID,
		"username":  user.RobloxUsername,
		"roblox_id": user.RobloxUserID,
		"role":      user.Role.Name,
		"exp":       time.Now().Add(time.Hour * 72).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	t, err := token.SignedString([]byte(secret))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate token"})
	}

	var permissions []string
	if user.RoleID != nil {
		for _, p := range user.Role.Permissions {
			permissions = append(permissions, p.Code)
		}
	}

	return c.JSON(fiber.Map{
		"token": t,
		"user": fiber.Map{
			"id":                    user.ID,
			"username":              user.RobloxUsername,
			"displayName":           user.RobloxDisplayName,
			"roblox_id":             user.RobloxUserID,
			"avatar":                user.AvatarURL,
			"role":                  user.Role.Name,
			"permissions":           permissions,
			"theme_preference":      user.ThemePreference,
			"show_display_names":    user.ShowDisplayNames,
			"live_notifications":    user.LiveNotifications,
			"sound_effects_enabled": user.SoundEffectsEnabled,
		},
	})
}

func Logout(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No token provided"})
	}

	tokenString := strings.TrimPrefix(authHeader, "Bearer ")

	// Extract expiry from token to know how long to keep it in blacklist
	token, _ := jwt.Parse(tokenString, nil) // Parsing without validation to get claims
	if token != nil {
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			if exp, ok := claims["exp"].(float64); ok {
				expiry := time.Unix(int64(exp), 0)
				ttl := time.Until(expiry)
				if ttl > 0 {
					cache.RDB.Set(cache.Ctx, "blacklist:"+tokenString, "true", ttl)
				}
			}
		}
	} else {
		// Fallback if token can't be parsed
		cache.RDB.Set(cache.Ctx, "blacklist:"+tokenString, "true", 24*time.Hour)
	}

	return c.JSON(fiber.Map{"message": "Logged out successfully"})
}

func GetPublicConfig(c *fiber.Ctx) error {
	appName := services.GetSystemSettingString("app_name", "Co-Play Capsule")
	enableRegistration := services.GetSystemSettingBool("enable_registration", true)
	
	return c.JSON(fiber.Map{
		"app_name":            appName,
		"enable_registration": enableRegistration,
	})
}
