package models

import "time"

type ProfileChangeLog struct {
	ID         uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	
	// Ubah FriendID menjadi UserID (merujuk profil siapa yang berubah)
	UserID     uint      `gorm:"index;not null" json:"user_id"` 
	User       User      `gorm:"foreignKey:UserID" json:"user"` // Relasi GORM
	
	// Log perubahan profil bersifat privat untuk setiap pelacak (agar tidak spam global)
	OwnerID    *uint     `gorm:"index" json:"owner_id,omitempty"`

	ChangeType string    `gorm:"type:varchar(50);not null" json:"change_type"` // username, display_name, avatar
	OldValue   string    `gorm:"type:text" json:"old_value"`
	NewValue   string    `gorm:"type:text" json:"new_value"`
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}
