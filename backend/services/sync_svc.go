package services

import (
	"fmt"
	"log"
	"strconv"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
)

func SyncUserFriends(userID uint, robloxUserID string, checkNames bool) error {
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

	var nameFetchIDs []uint64
	for _, rf := range robloxFriends {
		fIDStr := fmt.Sprintf("%d", rf.Id)
		if _, exists := efMap[fIDStr]; !exists {
			// New friend, always fetch name
			nameFetchIDs = append(nameFetchIDs, rf.Id)
		} else if checkNames {
			// Existing friend, fetch name if checkNames is true
			nameFetchIDs = append(nameFetchIDs, rf.Id)
		}
	}

	names := make(map[uint64]UserDetailData)
	if len(nameFetchIDs) > 0 {
		fetchedNames, err := GetUserDetails(nameFetchIDs)
		if err == nil {
			names = fetchedNames
		}
	}

	for _, rf := range robloxFriends {
		fIDStr := fmt.Sprintf("%d", rf.Id)
		
		// Set names from fetch if available, else keep whatever came from GetFriends (usually empty)
		rfName := rf.Name
		rfDisplayName := rf.DisplayName
		if n, ok := names[rf.Id]; ok {
			rfName = n.Name
			rfDisplayName = n.DisplayName
		}

		if ef, exists := efMap[fIDStr]; exists {
			// Check profile changes
			changed := false
			if checkNames {
				if rfName != "" && ef.FriendUsername != rfName {
					logChange(ef.ID, ef.FriendUsername, "username", ef.FriendUsername, rfName)
					ef.FriendUsername = rfName
					changed = true
				}
				if rfDisplayName != "" && ef.FriendDisplayName != rfDisplayName {
					logChange(ef.ID, ef.FriendUsername, "display_name", ef.FriendDisplayName, rfDisplayName)
					ef.FriendDisplayName = rfDisplayName
					changed = true
				}
			}
			if avatars[rf.Id] != "" && ef.AvatarURL != avatars[rf.Id] {
				logChange(ef.ID, ef.FriendUsername, "avatar", ef.AvatarURL, avatars[rf.Id])
				ef.AvatarURL = avatars[rf.Id]
				changed = true
			}
			if ef.Status == "removed" {
				ef.Status = "active"
				changed = true

				// Catat saat berteman kembali
				readdedLog := models.ActivityLog{
					FriendID: ef.ID,
					Status:   "Added Again",
					GameName: "-",
				}
				database.DB.Create(&readdedLog)
			}
			if changed {
				database.DB.Save(&ef)
			}
		} else {
			// New friend
			newFriend := models.Friend{
				UserID:            userID,
				FriendRobloxID:    fIDStr,
				FriendUsername:    rfName,
				FriendDisplayName: rfDisplayName,
				AvatarURL:         avatars[rf.Id],
				Status:            "active",
				CurrentPresence:   "Offline",
			}
			database.DB.Create(&newFriend)
			
			// Catat saat pertama kali ditambahkan
			firstAddLog := models.ActivityLog{
				FriendID: newFriend.ID,
				Status:   "First Added",
				GameName: "-",
			}
			database.DB.Create(&firstAddLog)

			log.Printf("[Sync] New friend added: %s (%s)\n", newFriend.FriendUsername, newFriend.FriendRobloxID)
		}
	}

	// Check for removed friends
	for _, ef := range existingFriends {
		if _, exists := rfMap[ef.FriendRobloxID]; !exists {
			if ef.Status != "removed" {
				ef.Status = "removed"
				database.DB.Save(&ef)
				
				// Catat ke Activity Log agar waktu terdeteksi tersimpan
				unfriendLog := models.ActivityLog{
					FriendID: ef.ID,
					Status:   "Removed",
					GameName: "-",
				}
				database.DB.Create(&unfriendLog)

				log.Printf("[Sync] Friend removed: %s (%s)\n", ef.FriendUsername, ef.FriendRobloxID)
			}
		}
	}

	return nil
}

func logChange(friendID uint, username, changeType, oldVal, newVal string) {
	dbLog := models.ProfileChangeLog{
		FriendID:   friendID,
		ChangeType: changeType,
		OldValue:   oldVal,
		NewValue:   newVal,
	}
	database.DB.Create(&dbLog)
	log.Printf("[Profile] Change detected for %s (ID %d): %s changed from '%s' to '%s'\n", username, friendID, changeType, oldVal, newVal)
}
