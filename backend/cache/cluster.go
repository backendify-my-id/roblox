package cache

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"time"

	"github.com/google/uuid"
)

var (
	InstanceUUID string
)

// GetClusterConfig registers the current instance heartbeat in Redis and calculates
// its dynamic ID and the total instances in the cluster. Falls back to static env vars if Redis is offline.
func GetClusterConfig() (int, int) {
	// 1. Check Env override first to maintain backwards compatibility
	idEnv := os.Getenv("INSTANCE_ID")
	totalEnv := os.Getenv("TOTAL_INSTANCES")
	if idEnv != "" || totalEnv != "" {
		instanceID := 1
		totalInstances := 1
		if id, err := strconv.Atoi(idEnv); err == nil && id > 0 {
			instanceID = id
		}
		if total, err := strconv.Atoi(totalEnv); err == nil && total > 0 {
			totalInstances = total
		}
		return instanceID, totalInstances
	}

	// 2. Dynamic registry via Redis if online
	if RDB != nil {
		if InstanceUUID == "" {
			InstanceUUID = uuid.New().String()
		}

		key := fmt.Sprintf("instance_heartbeat:%s", InstanceUUID)
		
		// Set heartbeat with 30s TTL
		RDB.Set(Ctx, key, time.Now().Unix(), 30*time.Second)

		// Fetch all active heartbeats
		keys, err := RDB.Keys(Ctx, "instance_heartbeat:*").Result()
		if err == nil && len(keys) > 0 {
			// Sort to have deterministic ordering
			sort.Strings(keys)

			totalInstances := len(keys)
			instanceID := 1
			for idx, k := range keys {
				if k == key {
					instanceID = idx + 1
					break
				}
			}
			return instanceID, totalInstances
		}
	}

	// 3. Fallback: single instance mode
	return 1, 1
}
