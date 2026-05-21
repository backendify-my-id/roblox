package models

import "time"

type GameReview struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	GameEntryID uint      `gorm:"index;not null;uniqueIndex:idx_entry_user" json:"game_entry_id"`
	UserID      uint      `gorm:"index;not null;uniqueIndex:idx_entry_user" json:"user_id"`
	User        User      `gorm:"foreignKey:UserID" json:"user"`
	Rating      int       `gorm:"type:integer;not null" json:"rating"` // 1-5
	Comment     string    `gorm:"type:text" json:"comment"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
