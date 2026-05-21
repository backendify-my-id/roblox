package models

import "time"

type GameEntry struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	GameListID  uint      `gorm:"index;not null" json:"game_list_id"`
	AddedByID   uint      `gorm:"index;not null" json:"added_by_id"`
	AddedBy     User      `gorm:"foreignKey:AddedByID" json:"added_by"`
	
	RobloxMapID uint      `gorm:"index;not null" json:"roblox_map_id"`
	RobloxMap   RobloxMap `gorm:"foreignKey:RobloxMapID" json:"roblox_map"`

	Description string    `gorm:"type:text" json:"description"`
	Status      string    `gorm:"type:varchar(50);not null;default:'to_play'" json:"status"` // "to_play" or "played"
	PlayedAt    *time.Time `json:"played_at,omitempty"`
	CreatedAt   time.Time `gorm:"index" json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	Media []GameMedia  `gorm:"foreignKey:GameEntryID" json:"media,omitempty"`
	Reviews []GameReview `gorm:"foreignKey:GameEntryID" json:"reviews,omitempty"`
}
