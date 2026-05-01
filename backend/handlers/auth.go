package handlers

import (
	"fmt"
	"os"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"strings"
)

type AuthRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func Register(c *fiber.Ctx) error {
	req := new(AuthRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Username == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Username and password are required"})
	}

	// Check if user already exists
	var existingUser models.User
	database.DB.Where("roblox_username = ?", req.Username).First(&existingUser)
	if existingUser.ID != 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Username already exists in database"})
	}

	// Validate against Roblox API
	robloxId, correctUsername, displayName, err := services.ValidateUsername(req.Username)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to validate Roblox username: " + err.Error()})
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

	user := models.User{
		RobloxUserID:      fmt.Sprintf("%d", robloxId),
		RobloxUsername:    correctUsername,
		RobloxDisplayName: displayName,
		PasswordHash:      string(hashedPassword),
		AvatarURL:         avatarUrl,
		CreatedAt:         time.Now(),
		RoleID:            role.ID,
	}

	if err := database.DB.Create(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create user"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "User registered successfully"})
}

func Login(c *fiber.Ctx) error {
	req := new(AuthRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var user models.User
	if err := database.DB.Preload("Role").Where("LOWER(roblox_username) = LOWER(?)", req.Username).First(&user).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid credentials"})
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

	return c.JSON(fiber.Map{
		"token": t,
		"user": fiber.Map{
			"id":          user.ID,
			"username":    user.RobloxUsername,
			"displayName": user.RobloxDisplayName,
			"roblox_id":   user.RobloxUserID,
			"avatar":      user.AvatarURL,
			"role":        user.Role.Name,
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
