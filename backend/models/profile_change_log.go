package models

import "time"

type ProfileChangeLog struct {
	ID         uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	FriendID   uint      `gorm:"index;not null" json:"friend_id"`
	ChangeType string    `gorm:"type:varchar(50);not null" json:"change_type"` // username, display_name, avatar
	OldValue   string    `gorm:"type:text" json:"old_value"`
	NewValue   string    `gorm:"type:text" json:"new_value"`
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}
