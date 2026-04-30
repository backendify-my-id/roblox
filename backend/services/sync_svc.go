package services

import (
	"fmt"
	"strconv"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
)

func SyncUserFriends(userID uint, robloxUserID string) error {
	rID, err := strconv.ParseUint(robloxUserID, 10, 64)
	if err != nil {
		return err
	}

	robloxFriends, err := GetFriends(rID)
	if err != nil {
		return err
	}

	// Create map for fast lookup
	rfMap := make(map[string]FriendData)
	var friendRobloxIDs []uint64
	for _, rf := range robloxFriends {
		rfMap[fmt.Sprintf("%d", rf.Id)] = rf
		friendRobloxIDs = append(friendRobloxIDs, rf.Id)
	}

	// Fetch avatars
	avatars, _ := GetAvatars(friendRobloxIDs)

	var existingFriends []models.Friend
	database.DB.Where("user_id = ?", userID).Find(&existingFriends)

	efMap := make(map[string]models.Friend)
	for _, ef := range existingFriends {
		efMap[ef.FriendRobloxID] = ef
	}

	for _, rf := range robloxFriends {
		fIDStr := fmt.Sprintf("%d", rf.Id)
		if ef, exists := efMap[fIDStr]; exists {
			// Check profile changes
			changed := false
			if ef.FriendUsername != rf.Name {
				logChange(ef.ID, "username", ef.FriendUsername, rf.Name)
				ef.FriendUsername = rf.Name
				changed = true
			}
			if ef.FriendDisplayName != rf.DisplayName {
				logChange(ef.ID, "display_name", ef.FriendDisplayName, rf.DisplayName)
				ef.FriendDisplayName = rf.DisplayName
				changed = true
			}
			if avatars[rf.Id] != "" && ef.AvatarURL != avatars[rf.Id] {
				logChange(ef.ID, "avatar", ef.AvatarURL, avatars[rf.Id])
				ef.AvatarURL = avatars[rf.Id]
				changed = true
			}
			if ef.Status == "removed" {
				ef.Status = "active"
				changed = true
			}
			if changed {
				database.DB.Save(&ef)
			}
		} else {
			// New friend
			newFriend := models.Friend{
				UserID:            userID,
				FriendRobloxID:    fIDStr,
				FriendUsername:    rf.Name,
				FriendDisplayName: rf.DisplayName,
				AvatarURL:         avatars[rf.Id],
				Status:            "active",
				CurrentPresence:   "Offline",
			}
			database.DB.Create(&newFriend)
		}
	}

	// Check for removed friends
	for _, ef := range existingFriends {
		if _, exists := rfMap[ef.FriendRobloxID]; !exists {
			if ef.Status != "removed" {
				ef.Status = "removed"
				database.DB.Save(&ef)
			}
		}
	}

	return nil
}

func logChange(friendID uint, changeType, oldVal, newVal string) {
	dbLog := models.ProfileChangeLog{
		FriendID:   friendID,
		ChangeType: changeType,
		OldValue:   oldVal,
		NewValue:   newVal,
	}
	database.DB.Create(&dbLog)
}
