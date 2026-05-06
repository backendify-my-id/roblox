package main

import (
	"log"
	"os"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/cron"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/handlers"
	"github.com/apany/roblox-friend-tracker/middleware"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load() // Optional: load .env file

	database.ConnectDB()
	cache.ConnectRedis()
	cron.StartJobs()

	// TRUST_PROXY configuration as per PRD
	trustProxy := os.Getenv("TRUST_PROXY") == "true"
	app := fiber.New(fiber.Config{
		EnableTrustedProxyCheck: trustProxy,
		TrustedProxies:          []string{"127.0.0.1", "192.168.1.11"},
	})

	app.Use(recover.New())
	app.Use(logger.New())

	corsOrigins := os.Getenv("CORS_ORIGIN")
	if corsOrigins == "" {
		corsOrigins = "http://192.168.1.11:8081,http://localhost:5173"
	}

	// CORS configuration: Allow local IP and specific domains
	app.Use(cors.New(cors.Config{
		AllowOrigins: corsOrigins,
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	// Rate Limiting (Prevent spamming refresh)
	app.Use(limiter.New(limiter.Config{
		Max:        100,
		Expiration: 1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Rate limit exceeded. Please try again later.",
			})
		},
	}))

	api := app.Group("/api")

	// Public Routes
	api.Post("/auth/register", handlers.Register)
	api.Post("/auth/login", handlers.Login)
	api.Post("/auth/logout", middleware.Protected(), handlers.Logout)

	// Protected Routes
	api.Use(middleware.Protected())

	// V3 Routes
	api.Get("/friends", handlers.GetFriends)
	api.Post("/friends/sync", handlers.ManualSync)
	api.Get("/friends/:friendId/logs", handlers.GetActivityLogs)
	api.Get("/friends/:friendId/profile-changes", handlers.GetProfileChangeLogs)
	api.Get("/user/settings", handlers.GetUserSettings)
	api.Put("/user/settings", handlers.UpdateStealthMode)
	api.Post("/user/stealth-exemptions", handlers.AddStealthExemption)
	api.Delete("/user/stealth-exemptions/:id", handlers.RemoveStealthExemption)

	// Admin Routes
	api.Get("/admin/users", handlers.GetAllUsers)
	api.Get("/admin/users/:id/logs", handlers.GetUserActivityLogs)
	api.Get("/admin/users/:id/profile-changes", handlers.GetUserProfileChanges)

	port := os.Getenv("APP_PORT")
	if port == "" {
		port = "7000"
	}

	log.Printf("Starting server on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
