package models

import "time"

type FeatureUsage struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"user_id"`
	FeatureName string    `gorm:"size:100;not null" json:"feature_name"`
	ActionType  string    `gorm:"size:50;not null" json:"action_type"`
	CreatedAt   time.Time `json:"created_at"`
}
