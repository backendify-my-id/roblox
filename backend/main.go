package main

import (
	"log"
	"os"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/cron"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/handlers"
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
	// Disable MVP V1 cron
	// cron.StartPresenceSync()
	cron.StartPresenceSyncV2()  // Every 5 min: log status changes to activity_logs
	cron.StartFriendsSyncCron() // Every 1 hour: sync friend list for all tracked users

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
		AllowHeaders: "Origin, Content-Type, Accept",
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

	api.Get("/friends", handlers.GetFriends)
	api.Post("/friends", handlers.AddFriend)
	api.Delete("/friends/:id", handlers.DeleteFriend)

	// V2 Routes
	api.Get("/v2/targets", handlers.GetAllTargets)                  // List all tracked targets
	api.Post("/v2/targets", handlers.AddOrSyncTarget)               // Add or re-sync a target
	api.Get("/v2/targets/:id/friends", handlers.GetTargetFriends)   // Get friends of a target
	api.Delete("/v2/targets/:id", handlers.DeleteTarget)            // Remove a target
	api.Get("/v2/friends/:friendId/logs", handlers.GetActivityLogs) // Get activity logs

	port := os.Getenv("APP_PORT")
	if port == "" {
		port = "7000"
	}

	log.Printf("Starting server on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
