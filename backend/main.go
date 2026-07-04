package main

import (
	"log"
	"os"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/cron"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/routes"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/apany/roblox-friend-tracker/utils"
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
	app.Use(logger.New(logger.Config{
		Output:     utils.GetHTTPLogWriter(),
		TimeFormat: "02/Jan/2006:15:04:05 -0700",
		Format:     "${time} | ${status} | ${latency} | ${ip} | ${method} | ${path} | ${error}\n",
	}))

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

	// Register API and WebSocket routes
	routes.Setup(app)

	port := os.Getenv("APP_PORT")
	if port == "" {
		port = "7000"
	}

	log.Printf("Starting server on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
