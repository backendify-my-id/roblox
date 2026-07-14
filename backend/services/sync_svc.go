package services

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/utils"
)

func SyncUserFriends(userID uint, robloxUserID string, checkNames bool) error {
	if _, err := SyncUserFriendsList(userID, robloxUserID); err != nil {
		return err
	}
	if _, err := SyncUserFriendAvatars(userID, robloxUserID); err != nil {
		return err
	}
	if checkNames {
		if _, err := SyncUserFriendProfiles(userID, robloxUserID); err != nil {
			return err
		}
	}
	return nil
}

func SyncUserFriendsList(userID uint, robloxUserID string) (int, error) {
	rID, err := strconv.ParseUint(robloxUserID, 10, 64)
	if err != nil {
		return 0, err
	}

	robloxFriends, err := GetFriends(rID)
	if err != nil {
		return 0, err
	}

	rfMap := make(map[string]FriendData)
	for _, rf := range robloxFriends {
		rfMap[fmt.Sprintf("%d", rf.Id)] = rf
	}

	var existingFriends []models.Friend
	database.DB.Preload("TargetUser").Where("user_id = ?", userID).Find(&existingFriends)

	efMap := make(map[string]models.Friend)
	for _, ef := range existingFriends {
		if ef.TargetUser.ID != 0 {
			efMap[ef.TargetUser.RobloxUserID] = ef
		}
	}

	changeCount := 0

	for _, rf := range robloxFriends {
		fIDStr := fmt.Sprintf("%d", rf.Id)

		var targetUser models.User
		if err := database.DB.Where("roblox_user_id = ?", fIDStr).First(&targetUser).Error; err != nil {
			username := rf.Name
			displayName := rf.DisplayName
			if username == "" {
				username = "RobloxUser_" + fIDStr
			}
			if displayName == "" {
				displayName = "RobloxUser_" + fIDStr
			}
			targetUser = models.User{
				RobloxUserID:      fIDStr,
				RobloxUsername:    username,
				RobloxDisplayName: displayName,
				CurrentPresence:   "Offline",
			}
			database.DB.Create(&targetUser)
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
				changeCount++
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
			changeCount++
		}
	}

	for _, ef := range existingFriends {
		if ef.TargetUser.ID == 0 {
			continue
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
				changeCount++
			}
		}
	}

	return changeCount, nil
}

func SyncUserFriendAvatars(userID uint, robloxUserID string) (int, error) {
	rID, err := strconv.ParseUint(robloxUserID, 10, 64)
	if err != nil {
		return 0, err
	}

	var friends []models.Friend
	database.DB.Preload("TargetUser").Where("user_id = ? AND status = ?", userID, "active").Find(&friends)

	var ids []uint64
	ids = append(ids, rID)
	for _, f := range friends {
		if f.TargetUser.ID != 0 {
			fID, parseErr := strconv.ParseUint(f.TargetUser.RobloxUserID, 10, 64)
			if parseErr == nil {
				ids = append(ids, fID)
			}
		}
	}

	if len(ids) == 0 {
		return 0, nil
	}

	avatars, err := GetAvatars(ids)
	if err != nil {
		return 0, err
	}

	changeCount := 0

	var selfUser models.User
	if err := database.DB.First(&selfUser, userID).Error; err == nil {
		selfAvatar := avatars[rID]
		if selfAvatar != "" && selfUser.AvatarURL != selfAvatar {
			logChange(selfUser.ID, userID, selfUser.RobloxUsername, "avatar", selfUser.AvatarURL, selfAvatar, selfUser.IsStealth)
			selfUser.AvatarURL = selfAvatar
			database.DB.Save(&selfUser)
			Hub.Broadcast(WSMessage{
				Type:   "profile_update",
				UserID: selfUser.ID,
				Payload: map[string]interface{}{
					"avatar_url": selfUser.AvatarURL,
				},
			})
			changeCount++
		}
	}

	for _, f := range friends {
		fID, parseErr := strconv.ParseUint(f.TargetUser.RobloxUserID, 10, 64)
		if parseErr != nil {
			continue
		}
		newAvatar := avatars[fID]
		if newAvatar != "" && f.TargetUser.AvatarURL != newAvatar {
			logChange(f.TargetUser.ID, userID, f.TargetUser.RobloxUsername, "avatar", f.TargetUser.AvatarURL, newAvatar, f.TargetUser.IsStealth)
			f.TargetUser.AvatarURL = newAvatar
			database.DB.Save(&f.TargetUser)
			Hub.Broadcast(WSMessage{
				Type:   "profile_update",
				UserID: f.TargetUser.ID,
				Payload: map[string]interface{}{
					"avatar_url": f.TargetUser.AvatarURL,
				},
			})
			changeCount++
		}
	}

	return changeCount, nil
}

func SyncUserFriendProfiles(userID uint, robloxUserID string) (int, error) {
	rID, err := strconv.ParseUint(robloxUserID, 10, 64)
	if err != nil {
		return 0, err
	}

	var selfUser models.User
	if err := database.DB.First(&selfUser, userID).Error; err != nil {
		return 0, err
	}

	var friends []models.Friend
	database.DB.Preload("TargetUser").Where("user_id = ? AND status = ?", userID, "active").Find(&friends)

	var ids []uint64
	if time.Since(selfUser.UpdatedAt) >= 1*time.Hour || selfUser.RobloxUsername == "" {
		ids = append(ids, rID)
	}

	for _, f := range friends {
		if f.TargetUser.ID != 0 {
			fID, parseErr := strconv.ParseUint(f.TargetUser.RobloxUserID, 10, 64)
			if parseErr == nil {
				needName := false
				if time.Since(f.TargetUser.UpdatedAt) >= 1*time.Hour {
					needName = true
				}
				if f.TargetUser.RobloxUsername == "" || strings.HasPrefix(f.TargetUser.RobloxUsername, "RobloxUser_") {
					needName = true
				}

				if needName {
					ids = append(ids, fID)
				}
			}
		}
	}

	if len(ids) == 0 {
		return 0, nil
	}

	names, syncErr := GetUserDetails(ids)
	if syncErr != nil && len(names) == 0 {
		return 0, syncErr
	}

	changeCount := 0

	if n, ok := names[rID]; ok {
		selfName := n.Name
		selfDisplayName := n.DisplayName
		changed := false
		if selfName != "" && selfUser.RobloxUsername != selfName {
			logChange(selfUser.ID, userID, selfUser.RobloxUsername, "username", selfUser.RobloxUsername, selfName, selfUser.IsStealth)
			selfUser.RobloxUsername = selfName
			changed = true
		}
		if selfDisplayName != "" && selfUser.RobloxDisplayName != selfDisplayName {
			logChange(selfUser.ID, userID, selfUser.RobloxUsername, "display_name", selfUser.RobloxDisplayName, selfDisplayName, selfUser.IsStealth)
			selfUser.RobloxDisplayName = selfDisplayName
			changed = true
		}
		if changed {
			database.DB.Save(&selfUser)
			Hub.Broadcast(WSMessage{
				Type:   "profile_update",
				UserID: selfUser.ID,
				Payload: map[string]interface{}{
					"roblox_username":     selfUser.RobloxUsername,
					"roblox_display_name": selfUser.RobloxDisplayName,
				},
			})
			changeCount++
		} else {
			// Touch UpdatedAt so we don't query it again for the next 1 hour
			database.DB.Model(&selfUser).Update("updated_at", time.Now())
		}
	}

	for _, f := range friends {
		fID, parseErr := strconv.ParseUint(f.TargetUser.RobloxUserID, 10, 64)
		if parseErr != nil {
			continue
		}
		if n, ok := names[fID]; ok {
			rfName := n.Name
			rfDisplayName := n.DisplayName
			changed := false
			if rfName != "" && f.TargetUser.RobloxUsername != rfName {
				if !strings.HasPrefix(f.TargetUser.RobloxUsername, "RobloxUser_") {
					logChange(f.TargetUser.ID, userID, f.TargetUser.RobloxUsername, "username", f.TargetUser.RobloxUsername, rfName, f.TargetUser.IsStealth)
				}
				f.TargetUser.RobloxUsername = rfName
				changed = true
			}
			if rfDisplayName != "" && f.TargetUser.RobloxDisplayName != rfDisplayName {
				if !strings.HasPrefix(f.TargetUser.RobloxDisplayName, "RobloxUser_") {
					logChange(f.TargetUser.ID, userID, f.TargetUser.RobloxUsername, "display_name", f.TargetUser.RobloxDisplayName, rfDisplayName, f.TargetUser.IsStealth)
				}
				f.TargetUser.RobloxDisplayName = rfDisplayName
				changed = true
			}
			if changed {
				database.DB.Save(&f.TargetUser)
				Hub.Broadcast(WSMessage{
					Type:   "profile_update",
					UserID: f.TargetUser.ID,
					Payload: map[string]interface{}{
						"roblox_username":     f.TargetUser.RobloxUsername,
						"roblox_display_name": f.TargetUser.RobloxDisplayName,
					},
				})
				changeCount++
			} else {
				// Touch UpdatedAt so we don't query it again for the next 1 hour
				database.DB.Model(&f.TargetUser).Update("updated_at", time.Now())
			}
		}
	}

	return changeCount, syncErr
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

				thresholdMinutes := GetSystemSettingInt("shadow_activity_threshold", 20)
				shadowThreshold := time.Duration(thresholdMinutes) * time.Minute

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

					// Send Discord Webhook warning
					NotifyShadowActivity(username, int(offlineDuration.Minutes()), oldVal, newVal)

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
