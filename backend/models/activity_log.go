package models

import "time"

type ActivityLog struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	
	UserID    uint      `gorm:"index;not null" json:"user_id"` 
	User      User      `gorm:"foreignKey:UserID" json:"user"` // Relasi GORM

	// Jika diisi, log ini hanya terlihat oleh pemilik ID ini (misal: "First Added")
	// Jika NULL, log ini bersifat global (misal: "In-Game")
	OwnerID   *uint     `gorm:"index" json:"owner_id,omitempty"` 

	Status    string    `gorm:"type:varchar(50);not null" json:"status"` // Offline, Online, In-Game
	GameName  string    `gorm:"type:varchar(255)" json:"game_name"`
	MapID     *uint     `gorm:"index" json:"map_id,omitempty"`
	Map       *RobloxMap `gorm:"foreignKey:MapID" json:"map,omitempty"`
	IsStealth bool      `gorm:"default:false" json:"is_stealth"` // True jika log ini dibuat saat user sedang mode siluman
	CreatedAt time.Time `gorm:"index" json:"created_at"`
}
