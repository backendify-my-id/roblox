package models

import "time"

type ActivityLog struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	FriendID  uint      `gorm:"index;not null" json:"friend_id"` // FK to friends.id
	Status    string    `gorm:"type:varchar(50);not null" json:"status"`
	GameName  *string   `gorm:"type:varchar(255)" json:"game_name"`
	CreatedAt time.Time `json:"created_at"`
}
