package models

import "time"

type RobloxMap struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	UniverseID  *uint64   `gorm:"uniqueIndex" json:"universe_id,omitempty"`
	PlaceID     *uint64   `gorm:"uniqueIndex" json:"place_id,omitempty"`
	Name        string    `gorm:"type:varchar(255);index;not null" json:"name"`
	Description string    `gorm:"type:text" json:"description,omitempty"`
	UrlPath     string    `gorm:"type:text" json:"url_path,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
