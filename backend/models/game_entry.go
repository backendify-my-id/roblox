package models

import "time"

type GameEntry struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	GameListID  uint      `gorm:"index;not null" json:"game_list_id"`
	AddedByID   uint      `gorm:"index;not null" json:"added_by_id"`
	AddedBy     User      `gorm:"foreignKey:AddedByID" json:"added_by"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	RobloxLink  string    `gorm:"type:varchar(255)" json:"roblox_link"`
	Status      string    `gorm:"type:varchar(50);not null;default:'to_play'" json:"status"` // "to_play" or "played"
	PlayedAt    *time.Time `json:"played_at,omitempty"`
	CreatedAt   time.Time `gorm:"index" json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	Media []GameMedia  `gorm:"foreignKey:GameEntryID" json:"media,omitempty"`
	Reviews []GameReview `gorm:"foreignKey:GameEntryID" json:"reviews,omitempty"`
}
