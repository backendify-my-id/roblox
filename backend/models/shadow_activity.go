package models

import "time"

type ShadowActivity struct {
	ID         uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID     uint      `gorm:"index;not null" json:"user_id"`
	User       User      `gorm:"foreignKey:UserID" json:"user"` // Relasi GORM
	OldAvatar  string    `gorm:"type:text" json:"old_avatar"`
	NewAvatar  string    `gorm:"type:text" json:"new_avatar"`
	IsReviewed bool      `gorm:"default:false" json:"is_reviewed"`
	AdminNotes string    `gorm:"type:text" json:"admin_notes"`
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}
