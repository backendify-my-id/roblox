package services

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
	"github.com/apany/roblox-friend-tracker/utils"
)

// Global rate limiter for all Roblox API calls.
// Roblox rate limit: 100 requests/minute/IP.
// We use 80 req/min as safe margin → ~750ms between requests.
var (
	rateMu      sync.Mutex
	lastRequest time.Time
	minInterval = 750 * time.Millisecond

	// Caching public IP once
	myPublicIP string
	ipOnce     sync.Once
)

func getPublicIP() string {
	ipOnce.Do(func() {
		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get("https://api.ipify.org")
		if err == nil {
			defer resp.Body.Close()
			if body, err := io.ReadAll(resp.Body); err == nil {
				myPublicIP = strings.TrimSpace(string(body))
			}
		}
		if myPublicIP == "" {
			myPublicIP = "unknown-ip"
		}
		utils.LogCron("INFO", "[RateLimit] Detected public IP for rate limiting: %s", myPublicIP)
	})
	return myPublicIP
}

// waitForRateLimit ensures we don't exceed Roblox's API rate limit.
// It blocks the caller if requests are coming too fast.
func waitForRateLimit() {
	rateMu.Lock()
	defer rateMu.Unlock()

	// Enforce minimum interval between requests for the local instance
	elapsed := time.Since(lastRequest)
	if elapsed < minInterval {
		time.Sleep(minInterval - elapsed)
	}

	ctx := cache.Ctx
	rdb := cache.RDB
	ip := getPublicIP()

	// Fallback to local rate limiting if Redis is not connected
	if rdb == nil {
		lastRequest = time.Now()
		return
	}

	for {
		now := time.Now()
		minuteKey := fmt.Sprintf("ratelimit:roblox_api:%s:%s", ip, now.Format("2006-01-02 15:04"))

		count, err := rdb.Incr(ctx, minuteKey).Result()
		if err != nil {
			utils.LogCron("ERROR", "[RateLimit] Redis connection failed, bypassing distributed rate limit: %v", err)
			break
		}

		if count == 1 {
			rdb.Expire(ctx, minuteKey, 120*time.Second)
		}

		if count <= 80 {
			if Hub != nil {
				remaining := 80 - int(count)
				if remaining < 0 {
					remaining = 0
				}
				go Hub.Broadcast(WSMessage{
					Type: "cron_progress",
					Payload: map[string]interface{}{
						"remaining_hits": remaining,
						"max_hits":       80,
					},
				})
			}
			break
		}

		// Calculate sleep time until the next minute
		nextMinute := now.Truncate(time.Minute).Add(time.Minute)
		waitTime := time.Until(nextMinute)
		if waitTime > 0 {
			utils.LogCron("WARNING", "[RateLimit] IP %s hit 80 calls in minute window, sleeping %v to reset", ip, waitTime)
			time.Sleep(waitTime)
		}
	}

	lastRequest = time.Now()
}

// WaitForUsersRateLimit specifically limits calls to the users endpoint (max 18 req/min for safety margin).
func WaitForUsersRateLimit() {
	rateMu.Lock()
	defer rateMu.Unlock()

	ctx := cache.Ctx
	rdb := cache.RDB
	ip := getPublicIP()

	// Local fallback if Redis is offline
	if rdb == nil {
		return
	}

	for {
		now := time.Now()
		minuteKey := fmt.Sprintf("ratelimit:roblox_users_api:%s:%s", ip, now.Format("2006-01-02 15:04"))

		count, err := rdb.Incr(ctx, minuteKey).Result()
		if err != nil {
			utils.LogCron("ERROR", "[RateLimit-Users] Redis connection failed, bypassing rate limit: %v", err)
			break
		}

		if count == 1 {
			rdb.Expire(ctx, minuteKey, 120*time.Second)
		}

		// Safe margin: 18 hits per minute (Roblox limit is 20)
		if count <= 18 {
			break
		}

		nextMinute := now.Truncate(time.Minute).Add(time.Minute)
		waitTime := time.Until(nextMinute)
		if waitTime > 0 {
			utils.LogCron("WARNING", "[RateLimit-Users] IP %s hit 18 calls to users API in minute window, sleeping %v to reset", ip, waitTime)
			time.Sleep(waitTime)
		}
	}
}

// GetRemainingHits returns how many API hits are still available in the current 1-minute window.
func GetRemainingHits() int {
	ctx := cache.Ctx
	rdb := cache.RDB
	if rdb == nil {
		return 80
	}

	ip := getPublicIP()
	minuteKey := fmt.Sprintf("ratelimit:roblox_api:%s:%s", ip, time.Now().Format("2006-01-02 15:04"))

	valStr, err := rdb.Get(ctx, minuteKey).Result()
	if err != nil {
		return 80
	}

	var count int
	fmt.Sscanf(valStr, "%d", &count)

	remaining := 80 - count
	if remaining < 0 {
		return 0
	}
	return remaining
}
