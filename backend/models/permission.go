package models

import "time"

type Permission struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Code        string    `gorm:"uniqueIndex;not null;type:varchar(100)" json:"code"`
	Description string    `gorm:"type:varchar(255)" json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}
