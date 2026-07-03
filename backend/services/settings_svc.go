package services

import (
	"strconv"
	"sync"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
)

var (
	settingsCache = make(map[string]string)
	cacheMu       sync.RWMutex
	lastLoad      time.Time
	cacheTTL      = 1 * time.Minute
)

func loadSettingsIntoCache() {
	cacheMu.Lock()
	defer cacheMu.Unlock()

	// Rate limit db loads
	if time.Since(lastLoad) < cacheTTL && len(settingsCache) > 0 {
		return
	}

	var settings []models.SystemSetting
	if database.DB != nil {
		if err := database.DB.Find(&settings).Error; err == nil {
			for _, s := range settings {
				settingsCache[s.Key] = s.Value
			}
			lastLoad = time.Now()
		}
	}
}

func GetSystemSettingString(key string, defaultVal string) string {
	loadSettingsIntoCache()

	cacheMu.RLock()
	defer cacheMu.RUnlock()

	val, exists := settingsCache[key]
	if !exists {
		return defaultVal
	}
	return val
}

func GetSystemSettingBool(key string, defaultVal bool) bool {
	valStr := GetSystemSettingString(key, "")
	if valStr == "" {
		return defaultVal
	}
	val, err := strconv.ParseBool(valStr)
	if err != nil {
		return defaultVal
	}
	return val
}

func GetSystemSettingInt(key string, defaultVal int) int {
	valStr := GetSystemSettingString(key, "")
	if valStr == "" {
		return defaultVal
	}
	val, err := strconv.Atoi(valStr)
	if err != nil {
		return defaultVal
	}
	return val
}

func SetSystemSetting(key string, value string) error {
	var setting models.SystemSetting
	if err := database.DB.Where("key = ?", key).First(&setting).Error; err != nil {
		// Create
		setting = models.SystemSetting{
			Key:       key,
			Value:     value,
			UpdatedAt: time.Now(),
		}
		if err := database.DB.Create(&setting).Error; err != nil {
			return err
		}
	} else {
		// Update
		setting.Value = value
		setting.UpdatedAt = time.Now()
		if err := database.DB.Save(&setting).Error; err != nil {
			return err
		}
	}

	// Update cache
	cacheMu.Lock()
	settingsCache[key] = value
	cacheMu.Unlock()

	return nil
}
