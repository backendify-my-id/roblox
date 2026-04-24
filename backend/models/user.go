package models

import "time"

type User struct {
	ID                 uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	RobloxUserID       string    `gorm:"unique;not null;type:varchar(100)" json:"roblox_user_id"`
	RobloxUsername     string    `gorm:"not null;type:varchar(100)" json:"roblox_username"`
	RobloxDisplayName  string    `gorm:"type:varchar(100)" json:"roblox_display_name"`
	AvatarURL          string    `gorm:"type:text" json:"avatar_url"`
	LastSynced         time.Time `json:"last_synced"`
}
