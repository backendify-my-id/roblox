package models

import "time"

type Friend struct {
	ID                uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID            uint      `gorm:"index;not null" json:"user_id"`
	FriendRobloxID    string    `gorm:"index;not null;type:varchar(100)" json:"friend_roblox_id"`
	FriendUsername    string    `gorm:"not null;type:varchar(100)" json:"friend_username"`
	FriendDisplayName string    `gorm:"type:varchar(100)" json:"friend_display_name"`
	AvatarURL         string    `gorm:"type:text" json:"avatar_url"`
	Status            string    `gorm:"type:varchar(20);default:'active'" json:"status"` // active, removed
	CurrentPresence   string    `gorm:"type:varchar(50);default:'Offline'" json:"current_presence"`
	CurrentGameName   string    `gorm:"type:varchar(255)" json:"current_game_name"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}
