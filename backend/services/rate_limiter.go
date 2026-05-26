package services

import (
	"sync"
	"time"

	"github.com/apany/roblox-friend-tracker/utils"
)

// Global rate limiter for all Roblox API calls.
// Roblox rate limit: 100 requests/minute/IP.
// We use 80 req/min as safe margin → ~750ms between requests.
var (
	rateMu      sync.Mutex
	lastRequest time.Time
	minInterval = 750 * time.Millisecond
	callCount   int
	windowStart time.Time
)

func init() {
	windowStart = time.Now()
}

// waitForRateLimit ensures we don't exceed Roblox's API rate limit.
// It blocks the caller if requests are coming too fast.
func waitForRateLimit() {
	rateMu.Lock()
	defer rateMu.Unlock()

	// Reset counter every minute
	if time.Since(windowStart) > time.Minute {
		callCount = 0
		windowStart = time.Now()
	}

	// If we've used 80 calls in this window, wait for the window to reset
	if callCount >= 80 {
		waitTime := time.Minute - time.Since(windowStart)
		if waitTime > 0 {
			utils.LogCron("WARNING", "[RateLimit] Hit 80 calls in window, sleeping %v to reset", waitTime)
			time.Sleep(waitTime)
		}
		callCount = 0
		windowStart = time.Now()
	}

	// Enforce minimum interval between requests
	elapsed := time.Since(lastRequest)
	if elapsed < minInterval {
		time.Sleep(minInterval - elapsed)
	}

	callCount++
	lastRequest = time.Now()
}

// GetRemainingHits returns how many API hits are still available in the current 1-minute window.
func GetRemainingHits() int {
	rateMu.Lock()
	defer rateMu.Unlock()

	// If the minute window has expired, the remaining count is reset to 80
	if time.Since(windowStart) > time.Minute {
		return 80
	}

	remaining := 80 - callCount
	if remaining < 0 {
		return 0
	}
	return remaining
}
