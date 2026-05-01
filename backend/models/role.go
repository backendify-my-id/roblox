package models

import "time"

type Role struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Name      string    `gorm:"uniqueIndex;not null;type:varchar(50)" json:"name"`
	CreatedAt time.Time `json:"created_at"`
}
