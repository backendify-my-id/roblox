package models

import (
	"time"
)

type TrackedFriend struct {
	ID             uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	RobloxUserID   string    `gorm:"unique;not null;type:varchar(100)" json:"roblox_user_id"`
	RobloxUsername string    `gorm:"not null;type:varchar(100)" json:"roblox_username"`
	LastStatus     string    `gorm:"type:varchar(50);default:'Offline'" json:"last_status"`
	LastPlayedGame   *string   `gorm:"type:varchar(255)" json:"last_played_game"`
	PresenceLocation *string   `gorm:"type:varchar(255)" json:"presence_location"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
