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
	"github.com/apany/roblox-friend-tracker/services"
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
	services.InitWSHub()
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

	// Static files for uploads
	app.Static("/uploads", "./uploads")

	api := app.Group("/api")

	// Public Routes
	api.Post("/auth/register", handlers.Register)
	api.Post("/auth/login", handlers.Login)
	api.Post("/auth/logout", middleware.Protected(), handlers.Logout)
	api.Get("/public/lists/:shareToken", handlers.GetPublicGameList)

	// WebSocket Route
	api.Get("/ws", handlers.UpgradeWebSocket, handlers.HandleWebSocket())

	// Protected Routes
	api.Use(middleware.Protected())

	// V3 Routes
	api.Get("/friends", handlers.GetFriends)
	api.Post("/friends/sync", handlers.ManualSync)
	api.Get("/friends/:friendId/logs", handlers.GetActivityLogs)
	api.Get("/friends/:friendId/profile-changes", handlers.GetProfileChangeLogs)
	api.Put("/friends/:friendId/note", handlers.UpdateFriendNote)
	api.Get("/user/settings", handlers.GetUserSettings)
	api.Put("/user/settings", handlers.UpdateStealthMode)
	api.Post("/user/stealth-exemptions", handlers.AddStealthExemption)
	api.Delete("/user/stealth-exemptions/:id", handlers.RemoveStealthExemption)
	api.Get("/user/logs", handlers.GetMyActivityLogs)
	api.Get("/user/profile-changes", handlers.GetMyProfileChanges)

	// Game Lists API
	api.Get("/lists", handlers.GetGameLists)
	api.Post("/lists", handlers.CreateGameList)
	api.Post("/lists/join", handlers.JoinGameList)        // Static route HARUS sebelum /:id
	api.Get("/lists/:id", handlers.GetGameListDetail)
	api.Put("/lists/:id", handlers.UpdateGameList)
	api.Delete("/lists/:id", handlers.DeleteGameList)
	api.Delete("/lists/:id/leave", handlers.LeaveGameList)
	api.Post("/lists/:id/invite", handlers.RegenerateInviteCode)

	// Game Entries API
	api.Get("/lists/:id/entries", handlers.GetGameEntries)
	api.Post("/lists/:id/entries", handlers.CreateGameEntry)
	api.Put("/lists/:id/entries/:eid", handlers.UpdateGameEntry)
	api.Delete("/lists/:id/entries/:eid", handlers.DeleteGameEntry)
	api.Patch("/lists/:id/entries/:eid/status", handlers.ToggleGameEntryStatus)

	// Roblox Maps API
	api.Get("/maps", handlers.GetRobloxMaps)
	api.Get("/maps/search-roblox", handlers.SearchRobloxGamesOnline)
	api.Post("/maps", handlers.CreateRobloxMap)

	// Game Media API
	api.Get("/lists/:id/entries/:eid/media", handlers.GetGameMedia)
	api.Post("/lists/:id/entries/:eid/media", handlers.UploadGameMedia)
	api.Delete("/lists/:id/entries/:eid/media/:mid", handlers.DeleteGameMedia)

	// Game Reviews API
	api.Get("/lists/:id/entries/:eid/reviews", handlers.GetGameReviews)
	api.Post("/lists/:id/entries/:eid/reviews", handlers.SubmitGameReview)

	// Admin Routes (RBAC Protected)
	api.Get("/admin/users", middleware.RequirePermission("view_users_list"), handlers.GetAllUsers)
	api.Put("/admin/users/:id/approve", middleware.RequirePermission("manage_user_permissions"), handlers.ApproveUser)
	api.Get("/admin/playing-together", middleware.RequirePermission("view_playing_together"), handlers.GetPlayingTogether)
	api.Get("/admin/shadow-activities", middleware.RequirePermission("view_shadow_activities"), handlers.GetShadowActivities)
	api.Put("/admin/shadow-activities/:id", middleware.RequirePermission("review_shadow_activities"), handlers.ReviewShadowActivity)
	api.Get("/admin/users/:id/logs", middleware.RequirePermission("view_users_list"), handlers.GetUserActivityLogs)
	api.Get("/admin/users/:id/profile-changes", middleware.RequirePermission("view_users_list"), handlers.GetUserProfileChanges)
	api.Get("/admin/users/:id/friends", middleware.RequirePermission("view_users_list"), handlers.GetUserFriends)
	api.Get("/admin/users/:id/tracked-by", middleware.RequirePermission("view_users_list"), handlers.GetUserTrackers)
	api.Put("/admin/users/:id/note", middleware.RequirePermission("view_users_list"), handlers.UpdateAdminNote)
	api.Put("/admin/users/:id/role", middleware.RequirePermission("manage_user_permissions"), handlers.UpdateUserRole)
	api.Get("/admin/logs/files", middleware.RequirePermission("view_users_list"), handlers.GetCronLogFiles)
	api.Get("/admin/logs/files/:filename", middleware.RequirePermission("view_users_list"), handlers.GetCronLogContent)
	api.Get("/admin/backup", handlers.BackupDatabase)
	api.Post("/admin/restore", handlers.RestoreDatabase)

	port := os.Getenv("APP_PORT")
	if port == "" {
		port = "7000"
	}

	log.Printf("Starting server on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
