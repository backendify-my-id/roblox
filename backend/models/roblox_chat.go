package models

import "time"

type RobloxConversation struct {
	ID          string    `gorm:"primaryKey;type:varchar(255)" json:"id"`
	Type        string    `gorm:"type:varchar(50)" json:"type"` // "one_to_one", "group", "MultiUser", dll.
	Name        string    `gorm:"type:varchar(255)" json:"name"`
	CreatedBy   uint64    `json:"created_by"`
	LastUpdated time.Time `gorm:"index" json:"last_updated"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type RobloxChatMessage struct {
	ID             string    `gorm:"primaryKey;type:varchar(255)" json:"id"`
	ConversationID string    `gorm:"index;type:varchar(255)" json:"conversation_id"`
	Content        string    `gorm:"type:text" json:"content"`
	SenderUserID   *uint64   `gorm:"index" json:"sender_user_id"` // NULL jika pesan sistem
	SenderUsername string    `gorm:"type:varchar(255)" json:"sender_username"`
	SenderDisplayName string `gorm:"type:varchar(255)" json:"sender_display_name"`
	CreatedAt      time.Time `gorm:"index" json:"created_at"`
	ModerationType string    `gorm:"type:varchar(100)" json:"moderation_type"`
	Type           string    `gorm:"type:varchar(50)" json:"type"` // "system", "user", dll.
	IsDeleted      bool      `gorm:"default:false" json:"is_deleted"`
}

type RobloxConversationParticipant struct {
	ConversationID string `gorm:"primaryKey;type:varchar(255);index"`
	RobloxUserID   uint64 `gorm:"primaryKey;index"`
	Username       string `gorm:"type:varchar(255)"`
	DisplayName    string `gorm:"type:varchar(255)"`
}
