package models

import "time"

type User struct {
	ID                uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	RobloxUserID      string    `gorm:"uniqueIndex;not null;type:varchar(100)" json:"roblox_user_id"`
	RobloxUsername    string    `gorm:"uniqueIndex;not null;type:varchar(100)" json:"roblox_username"`
	RobloxDisplayName string    `gorm:"type:varchar(100)" json:"roblox_display_name"`
	
	// Dihilangkan not null agar teman yang disinkronisasi bisa masuk tanpa password
	PasswordHash      string    `json:"-"` 
	
	AvatarURL         string    `gorm:"type:text" json:"avatar_url"`
	
	// --- DIPINDAHKAN DARI TABEL FRIEND LAMA ---
	CurrentPresence   string    `gorm:"type:varchar(50);default:'Offline'" json:"current_presence"`
	CurrentGameName   string    `gorm:"type:varchar(255)" json:"current_game_name"`
	// ------------------------------------------

	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"` // Tambahan best practice
	RoleID            *uint     `json:"role_id"` // Pakai pointer (*) agar nullable untuk teman hasil sync
	Role              Role      `gorm:"foreignKey:RoleID" json:"role"`
	IsStealth         bool      `gorm:"default:false" json:"is_stealth"`

	// Pengguna yang dikecualikan dari Mode Siluman (bisa melihat status asli kita)
	StealthExempts    []*User   `gorm:"many2many:stealth_exemptions;joinForeignKey:UserID;joinReferences:ExemptID" json:"stealth_exempts,omitempty"`

	// Relasi untuk menarik daftar teman dari User ini
	Friends           []Friend  `gorm:"foreignKey:UserID" json:"friends,omitempty"`
}
