package models

import "time"

type Friend struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	
	// ID Pengguna yang punya daftar teman (Akun yang Login)
	UserID    uint      `gorm:"uniqueIndex:idx_user_friend;not null" json:"user_id"`
	
	// ID Pengguna yang menjadi temannya (FK merujuk ke tabel User juga)
	FriendID  uint      `gorm:"uniqueIndex:idx_user_friend;not null" json:"friend_id"` 
	
	// Relasi GORM untuk menarik data target profil teman secara otomatis
	TargetUser User     `gorm:"foreignKey:FriendID;references:ID" json:"target_user"` 

	Status    string    `gorm:"type:varchar(20);default:'active'" json:"status"` // active, removed
	Note      string    `gorm:"type:text" json:"note"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
