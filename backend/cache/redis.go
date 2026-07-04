package cache

import (
	"context"
	"fmt"
	"os"

	"github.com/apany/roblox-friend-tracker/utils"
	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client
var Ctx = context.Background()

func ConnectRedis() {
	host := os.Getenv("REDIS_HOST")
	port := os.Getenv("REDIS_PORT")
	password := os.Getenv("REDIS_PASSWORD")
	dbStr := os.Getenv("REDIS_DB")

	if host == "" {
		host = "localhost"
	}
	if port == "" {
		port = "6379"
	}

	dbInt := 0
	if dbStr != "" {
		// Just quick parse, ignoring error for simplicity, fallback to 0
		fmt.Sscanf(dbStr, "%d", &dbInt)
	}

	RDB = redis.NewClient(&redis.Options{
		Addr:     host + ":" + port,
		Password: password, // no password set if empty
		DB:       dbInt,
	})

	_, err := RDB.Ping(Ctx).Result()
	if err != nil {
		utils.LogStartup("Failed to connect to Redis: %v", err)
		os.Exit(1)
	}
	utils.LogStartup("Redis connection established")
}
