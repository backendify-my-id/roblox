package models

import "time"

type Friend struct {
	ID                 uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID             uint      `gorm:"index;not null" json:"user_id"` // FK to users.id
	FriendRobloxID     string    `gorm:"not null;type:varchar(100)" json:"friend_roblox_id"`
	FriendUsername     string    `gorm:"not null;type:varchar(100)" json:"friend_username"`
	FriendDisplayName  string    `gorm:"type:varchar(100)" json:"friend_display_name"`
	AvatarURL          string    `gorm:"type:text" json:"avatar_url"`
	IsDeleted          bool      `gorm:"default:false" json:"is_deleted"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}
