package models

import "time"

type GameList struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	InviteCode  string    `gorm:"type:varchar(20);uniqueIndex;not null" json:"invite_code"`
	ShareToken  string    `gorm:"type:varchar(50);uniqueIndex;not null" json:"share_token"`
	OwnerID     uint      `gorm:"index;not null" json:"owner_id"`
	Owner       User      `gorm:"foreignKey:OwnerID" json:"owner"`
	CreatedAt   time.Time `gorm:"index" json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	Members []GameListMember `gorm:"foreignKey:GameListID" json:"members,omitempty"`
	Entries []GameEntry      `gorm:"foreignKey:GameListID" json:"entries,omitempty"`
}

type GameListMember struct {
	GameListID uint      `gorm:"primaryKey" json:"game_list_id"`
	UserID     uint      `gorm:"primaryKey" json:"user_id"`
	User       User      `gorm:"foreignKey:UserID" json:"user"`
	JoinedAt   time.Time `gorm:"autoCreateTime" json:"joined_at"`
}
