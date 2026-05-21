package models

import "time"

type GameMedia struct {
	ID           uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	GameEntryID  uint      `gorm:"index;not null" json:"game_entry_id"`
	UploadedByID uint      `gorm:"index;not null" json:"uploaded_by_id"`
	UploadedBy   User      `gorm:"foreignKey:UploadedByID" json:"uploaded_by"`
	FileURL      string    `gorm:"type:text;not null" json:"file_url"`
	FileType     string    `gorm:"type:varchar(50);not null" json:"file_type"` // "image" or "video"
	Caption      string    `gorm:"type:text" json:"caption"`
	CreatedAt    time.Time `gorm:"index" json:"created_at"`
}
