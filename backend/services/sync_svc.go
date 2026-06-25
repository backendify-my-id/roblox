package services

import (
	"fmt"
	"strconv"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/utils"
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

	rfMap := make(map[string]FriendData)
	var friendRobloxIDs []uint64
	for _, rf := range robloxFriends {
		rfMap[fmt.Sprintf("%d", rf.Id)] = rf
		friendRobloxIDs = append(friendRobloxIDs, rf.Id)
	}

	avatars, _ := GetAvatars(friendRobloxIDs)

	var existingFriends []models.Friend
	database.DB.Preload("TargetUser").Where("user_id = ?", userID).Find(&existingFriends)

	efMap := make(map[string]models.Friend)
	for _, ef := range existingFriends {
		if ef.TargetUser.ID != 0 {
			efMap[ef.TargetUser.RobloxUserID] = ef
		}
	}

	var nameFetchIDs []uint64
	for _, rf := range robloxFriends {
		fIDStr := fmt.Sprintf("%d", rf.Id)
		ef, exists := efMap[fIDStr]
		if !exists || ef.Status == "removed" {
			nameFetchIDs = append(nameFetchIDs, rf.Id)
		} else if checkNames {
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
		
		rfName := rf.Name
		rfDisplayName := rf.DisplayName
		if n, ok := names[rf.Id]; ok {
			rfName = n.Name
			rfDisplayName = n.DisplayName
		}


		var targetUser models.User
		if err := database.DB.Where("roblox_user_id = ?", fIDStr).First(&targetUser).Error; err != nil {
			targetUser = models.User{
				RobloxUserID:      fIDStr,
				RobloxUsername:    rfName,
				RobloxDisplayName: rfDisplayName,
				AvatarURL:         avatars[rf.Id],
				CurrentPresence:   "Offline",
			}
			database.DB.Create(&targetUser)
		} else {
			changed := false
			if rfName != "" && targetUser.RobloxUsername != rfName {
				logChange(targetUser.ID, userID, targetUser.RobloxUsername, "username", targetUser.RobloxUsername, rfName, targetUser.IsStealth)
				targetUser.RobloxUsername = rfName
				changed = true
			}
			if rfDisplayName != "" && targetUser.RobloxDisplayName != rfDisplayName {
				logChange(targetUser.ID, userID, targetUser.RobloxUsername, "display_name", targetUser.RobloxDisplayName, rfDisplayName, targetUser.IsStealth)
				targetUser.RobloxDisplayName = rfDisplayName
				changed = true
			}
			if avatars[rf.Id] != "" && targetUser.AvatarURL != avatars[rf.Id] {
				logChange(targetUser.ID, userID, targetUser.RobloxUsername, "avatar", targetUser.AvatarURL, avatars[rf.Id], targetUser.IsStealth)
				targetUser.AvatarURL = avatars[rf.Id]
				changed = true
			}
			if changed {
				database.DB.Save(&targetUser)
				Hub.Broadcast(WSMessage{
					Type:   "profile_update",
					UserID: targetUser.ID,
				})
			}
		}

		if ef, exists := efMap[fIDStr]; exists {
			if ef.Status == "removed" {
				ef.Status = "active"
				database.DB.Save(&ef)
				database.DB.Create(&models.ActivityLog{
					UserID:   targetUser.ID,
					OwnerID:  &userID,
					Status:   "Added Again",
					GameName: "-",
				})
				Hub.Broadcast(WSMessage{
					Type:   "presence_update",
					UserID: targetUser.ID,
				})
			}
		} else {
			newFriend := models.Friend{
				UserID:   userID,
				FriendID: targetUser.ID,
				Status:   "active",
			}
			database.DB.Create(&newFriend)
			database.DB.Create(&models.ActivityLog{
				UserID:   targetUser.ID,
				OwnerID:  &userID,
				Status:   "First Added",
				GameName: "-",
			})
			utils.LogCron("INFO", "[Sync] New friend added: %s (%s)", targetUser.RobloxUsername, targetUser.RobloxUserID)
			Hub.Broadcast(WSMessage{
				Type:   "presence_update",
				UserID: targetUser.ID,
			})
		}
	}

	for _, ef := range existingFriends {
		if ef.TargetUser.ID == 0 {
			continue // Skip invalid relations
		}
		if _, exists := rfMap[ef.TargetUser.RobloxUserID]; !exists {
			if ef.Status != "removed" {
				ef.Status = "removed"
				database.DB.Save(&ef)
				database.DB.Create(&models.ActivityLog{
					UserID:   ef.TargetUser.ID,
					OwnerID:  &userID,
					Status:   "Removed",
					GameName: "-",
				})
				utils.LogCron("INFO", "[Sync] Friend removed: %s (%s)", ef.TargetUser.RobloxUsername, ef.TargetUser.RobloxUserID)
				Hub.Broadcast(WSMessage{
					Type:   "presence_update",
					UserID: ef.TargetUser.ID,
				})
			}
		}
	}

	return nil
}

func logChange(targetUserID uint, ownerID uint, username, changeType, oldVal, newVal string, isStealth bool) {
	dbLog := models.ProfileChangeLog{
		UserID:     targetUserID,
		OwnerID:    &ownerID,
		ChangeType: changeType,
		OldValue:   oldVal,
		NewValue:   newVal,
		IsStealth:  isStealth,
	}
	database.DB.Create(&dbLog)
	utils.LogCron("INFO", "[Profile] Change detected for %s (ID %d): %s changed from '%s' to '%s' (stealth=%t)", username, targetUserID, changeType, oldVal, newVal, isStealth)

	// Deteksi Shadow Activity secara Real-Time dengan threshold 20 menit
	if changeType == "avatar" {
		var u models.User
		if err := database.DB.Select("current_presence").First(&u, targetUserID).Error; err == nil {
			if u.CurrentPresence == "Offline" {
				// Cari kapan user MASUK ke status Offline saat ini (log Offline terbaru)
				var lastOfflineLog models.ActivityLog
				err := database.DB.
					Where("user_id = ? AND status = 'Offline'", targetUserID).
					Order("created_at DESC").
					First(&lastOfflineLog).Error

				const shadowThreshold = 20 * time.Minute

				if err != nil {
					// Tidak ada log Offline sama sekali — skip, data tidak cukup
					utils.LogCron("WARNING", "[ShadowActivity] Skipped for %s (ID %d): no Offline log found", username, targetUserID)
					return
				}

				// Hitung sudah berapa lama berada dalam status Offline saat ini
				offlineDuration := time.Since(lastOfflineLog.CreatedAt)

				if offlineDuration >= shadowThreshold {
					shadowAct := models.ShadowActivity{
						UserID:          targetUserID,
						OldAvatar:       oldVal,
						NewAvatar:       newVal,
						IsReviewed:      false,
						AdminNotes:      "",
						OfflineDuration: int(offlineDuration.Minutes()),
					}
					database.DB.Create(&shadowAct)
					utils.LogCron("WARNING", "[ShadowActivity] Stealth online detected! User %s (ID %d) changed avatar while offline for %.0f minutes!",
						username, targetUserID, offlineDuration.Minutes())
				} else {
					utils.LogCron("INFO", "[ShadowActivity] Avatar change for %s (ID %d) skipped — offline only %.0f min (threshold: %d min)",
						username, targetUserID, offlineDuration.Minutes(), int(shadowThreshold.Minutes()))
				}
			}
		}
	}
}
