package models

import "time"

type User struct {
	ID                uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	RobloxUserID      string    `gorm:"uniqueIndex;not null;type:varchar(100)" json:"roblox_user_id"`
	RobloxUsername    string    `gorm:"uniqueIndex;not null;type:varchar(100)" json:"roblox_username"`
	RobloxDisplayName string    `gorm:"type:varchar(100)" json:"roblox_display_name"`
	PasswordHash      string    `gorm:"not null" json:"-"`
	AvatarURL         string    `gorm:"type:text" json:"avatar_url"`
	CreatedAt         time.Time `json:"created_at"`
}
