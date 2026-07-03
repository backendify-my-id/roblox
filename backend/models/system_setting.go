package models

import "time"

type SystemSetting struct {
	Key       string    `gorm:"primaryKey;type:varchar(100)" json:"key"`
	Value     string    `gorm:"type:text" json:"value"`
	Type      string    `gorm:"type:varchar(20);default:'string'" json:"type"` // string, boolean, integer, json
	UpdatedAt time.Time `json:"updated_at"`
}
