package models

import "time"

type ActivityLog struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	FriendID  uint      `gorm:"index;not null" json:"friend_id"`
	Status    string    `gorm:"type:varchar(50);not null" json:"status"` // Offline, Online, In-Game
	GameName  string    `gorm:"type:varchar(255)" json:"game_name"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`
}
