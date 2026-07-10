package handlers

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
)

func GetAllUsers(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	search := strings.TrimSpace(c.Query("search", ""))
	role := c.Query("role", "All")
	presence := c.Query("presence", "All")

	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	offset := (page - 1) * limit

	query := database.DB.Model(&models.User{})

	if search != "" {
		searchQuery := "%" + strings.ToLower(search) + "%"
		query = query.Where("LOWER(roblox_username) LIKE ? OR LOWER(roblox_display_name) LIKE ?", searchQuery, searchQuery)
	}

	if role != "All" {
		if role == "Synced Friend" {
			query = query.Where("role_id IS NULL")
		} else {
			var roleModel models.Role
			if err := database.DB.Where("name = ?", role).First(&roleModel).Error; err == nil {
				query = query.Where("role_id = ?", roleModel.ID)
			} else {
				query = query.Where("role_id = 999999")
			}
		}
	}

	if presence != "All" {
		query = query.Where("current_presence = ?", presence)
	}

	var totalItems int64
	if err := query.Count(&totalItems).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to count users"})
	}

	var users []models.User
	if err := query.Preload("Role").Order("created_at desc").Offset(offset).Limit(limit).Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch users"})
	}

	userIDs := make([]uint, len(users))
	for i, u := range users {
		userIDs[i] = u.ID
	}

	type FriendCount struct {
		UserID uint
		Count  int
	}
	var counts []FriendCount
	friendCounts := make(map[uint]int)
	if len(userIDs) > 0 {
		database.DB.Model(&models.Friend{}).
			Select("user_id, count(*) as count").
			Where("user_id IN ? AND status = 'active'", userIDs).
			Group("user_id").
			Scan(&counts)
		for _, cn := range counts {
			friendCounts[cn.UserID] = cn.Count
		}
	}

	type UserResponse struct {
		ID                uint   `json:"id"`
		RobloxUserID      string `json:"roblox_user_id"`
		RobloxUsername    string `json:"roblox_username"`
		RobloxDisplayName string `json:"roblox_display_name"`
		AvatarURL         string `json:"avatar_url"`
		CurrentPresence   string `json:"current_presence"`
		CurrentGameName   string `json:"current_game_name"`
		IsStealth         bool   `json:"is_stealth"`
		IsApproved        bool   `json:"is_approved"`
		RoleName          string `json:"role_name"`
		IsRegistered      bool   `json:"is_registered"`
		FriendsCount      int    `json:"friends_count"`
		AdminNote         string `json:"admin_note"`
		CreatedAt         string `json:"created_at"`
	}

	var res []UserResponse
	for _, u := range users {
		roleName := "User"
		isRegistered := false
		if u.RoleID != nil {
			roleName = u.Role.Name
			isRegistered = true
		} else {
			roleName = "Synced Friend"
		}

		res = append(res, UserResponse{
			ID:                u.ID,
			RobloxUserID:      u.RobloxUserID,
			RobloxUsername:    u.RobloxUsername,
			RobloxDisplayName: u.RobloxDisplayName,
			AvatarURL:         u.AvatarURL,
			CurrentPresence:   u.CurrentPresence,
			CurrentGameName:   u.CurrentGameName,
			IsStealth:         u.IsStealth,
			IsApproved:        u.IsApproved,
			RoleName:          roleName,
			IsRegistered:      isRegistered,
			FriendsCount:      friendCounts[u.ID],
			AdminNote:         u.AdminNote,
			CreatedAt:         u.CreatedAt.Format("02/01/2006, 15:04:05"),
		})
	}

	totalPages := int(totalItems / int64(limit))
	if totalItems%int64(limit) > 0 {
		totalPages++
	}
	if totalPages == 0 {
		totalPages = 1
	}

	return c.JSON(fiber.Map{
		"data":        res,
		"total_items": totalItems,
		"total_pages": totalPages,
		"page":        page,
		"limit":       limit,
	})
}

func ApproveUser(c *fiber.Ctx) error {
	userId := c.Params("id")

	type ApproveRequest struct {
		IsApproved bool `json:"is_approved"`
	}

	req := new(ApproveRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	result := database.DB.Model(&models.User{}).
		Where("id = ?", userId).
		Update("is_approved", req.IsApproved)

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update user approval status"})
	}
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	// Fetch username for notification
	var targetUser models.User
	if err := database.DB.First(&targetUser, userId).Error; err == nil {
		adminUsername, _ := c.Locals("username").(string)
		actionDesc := fmt.Sprintf("Persetujuan untuk user @%s diubah menjadi: %t", targetUser.RobloxUsername, req.IsApproved)
		services.NotifyAdminAction(adminUsername, "Approve/Disapprove User", actionDesc)
	}

	statusMsg := "disetujui"
	if !req.IsApproved {
		statusMsg = "ditolak/ditangguhkan"
	}
	return c.JSON(fiber.Map{"message": "User berhasil " + statusMsg})
}

func GetUserActivityLogs(c *fiber.Ctx) error {
	userId := c.Params("id")
	offset := c.QueryInt("offset", 0)
	limit := c.QueryInt("limit", 100)

	var logs []models.ActivityLog
	if err := database.DB.Preload("Map").Preload("Owner").Where("user_id = ?", userId).Order("created_at desc").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch activity logs"})
	}

	return c.JSON(logs)
}

func GetUserProfileChanges(c *fiber.Ctx) error {
	userId := c.Params("id")
	offset := c.QueryInt("offset", 0)
	limit := 100

	var logs []models.ProfileChangeLog
	if err := database.DB.Where("user_id = ?", userId).Order("created_at desc").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch profile change logs"})
	}

	return c.JSON(logs)
}

func GetUserFriends(c *fiber.Ctx) error {
	userId := c.Params("id")
	offset := c.QueryInt("offset", 0)
	limit := 100

	var friends []models.Friend
	// Preload target user details
	if err := database.DB.Preload("TargetUser").Where("user_id = ?", userId).Order("created_at desc").Offset(offset).Limit(limit).Find(&friends).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch user friends"})
	}

	// Buat response custom
	type FriendResponse struct {
		ID                uint    `json:"id"`
		FriendID          uint    `json:"friend_id"`
		FriendRobloxID    string  `json:"friend_roblox_id"`
		FriendUsername    string  `json:"friend_username"`
		FriendDisplayName string  `json:"friend_display_name"`
		AvatarURL         string  `json:"avatar_url"`
		Status            string  `json:"status"`
		Note              string  `json:"note"`
		CreatedAt         string  `json:"created_at"`
		RemovedAt         string  `json:"removed_at,omitempty"`
		CurrentPresence   string  `json:"current_presence"`
		CurrentGameName   string  `json:"current_game_name"`
		CurrentGameID     string  `json:"current_game_id,omitempty"`
		CurrentPlaceID    *uint64 `json:"current_place_id,omitempty"`
	}

	var res []FriendResponse
	for _, f := range friends {
		removedAtVal := ""
		if f.Status == "removed" {
			removedAtVal = f.UpdatedAt.Format("02/01/2006, 15:04:05")
		}

		res = append(res, FriendResponse{
			ID:                f.ID,
			FriendID:          f.TargetUser.ID,
			FriendRobloxID:    f.TargetUser.RobloxUserID,
			FriendUsername:    f.TargetUser.RobloxUsername,
			FriendDisplayName: f.TargetUser.RobloxDisplayName,
			AvatarURL:         f.TargetUser.AvatarURL,
			Status:            f.Status,
			Note:              f.Note,
			CreatedAt:         f.CreatedAt.Format("02/01/2006, 15:04:05"),
			RemovedAt:         removedAtVal,
			CurrentPresence:   f.TargetUser.CurrentPresence,
			CurrentGameName:   f.TargetUser.CurrentGameName,
			CurrentGameID:     f.TargetUser.CurrentGameID,
			CurrentPlaceID:    f.TargetUser.CurrentPlaceID,
		})
	}

	return c.JSON(res)
}

func GetUserTrackers(c *fiber.Ctx) error {
	userId := c.Params("id")

	type TrackerResult struct {
		ID                uint      `json:"id"`
		RobloxUserID      string    `json:"roblox_user_id"`
		RobloxUsername    string    `json:"roblox_username"`
		RobloxDisplayName string    `json:"roblox_display_name"`
		AvatarURL         string    `json:"avatar_url"`
		RoleName          string    `json:"role_name"`
		Status            string    `json:"status"`
		Note              string    `json:"note"`
		CreatedAt         time.Time `json:"created_at"`
	}

	var results []TrackerResult

	query := `
		SELECT 
			u.id, u.roblox_user_id, u.roblox_username, u.roblox_display_name, u.avatar_url,
			COALESCE(r.name, 'Synced Friend') as role_name,
			f.status, f.note, f.created_at
		FROM friends f
		JOIN users u ON f.user_id = u.id
		LEFT JOIN roles r ON u.role_id = r.id
		WHERE f.friend_id = ?
		ORDER BY f.created_at DESC
	`

	if err := database.DB.Raw(query, userId).Scan(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch user trackers"})
	}

	return c.JSON(results)
}

func UpdateAdminNote(c *fiber.Ctx) error {
	userId := c.Params("id")

	var input struct {
		AdminNote string `json:"admin_note"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	adminNote := strings.TrimSpace(input.AdminNote)
	if len(adminNote) > 2000 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Admin note too long (maximum 2000 characters)"})
	}

	result := database.DB.Model(&models.User{}).
		Where("id = ?", userId).
		Update("admin_note", adminNote)

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update admin note"})
	}
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	return c.JSON(fiber.Map{"message": "Admin note updated successfully", "admin_note": adminNote})
}

func UpdateUserRole(c *fiber.Ctx) error {
	userId := c.Params("id")

	currentUserID, err := getUserID(c)
	if err == nil {
		targetUserIDVal, parseErr := strconv.ParseUint(userId, 10, 64)
		if parseErr == nil && uint(targetUserIDVal) == currentUserID {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Anda tidak diperbolehkan mengubah peran (role) Anda sendiri untuk mencegah lockout"})
		}
	}

	var input struct {
		RoleName string `json:"role_name"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	var role models.Role
	if err := database.DB.Where("name = ?", input.RoleName).First(&role).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Role not found"})
	}

	result := database.DB.Model(&models.User{}).
		Where("id = ?", userId).
		Update("role_id", &role.ID)

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update user role"})
	}
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	return c.JSON(fiber.Map{
		"message": "User role updated successfully",
		"role":    role.Name,
	})
}

func DeleteUser(c *fiber.Ctx) error {
	userId := c.Params("id")

	// Lockout prevention: Admin cannot delete their own account
	currentUserID, err := getUserID(c)
	if err == nil {
		targetUserIDVal, parseErr := strconv.ParseUint(userId, 10, 64)
		if parseErr == nil && uint(targetUserIDVal) == currentUserID {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Anda tidak diperbolehkan menghapus akun Anda sendiri untuk mencegah lockout"})
		}
	}

	var user models.User
	if err := database.DB.First(&user, userId).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User tidak ditemukan"})
	}

	// We downgrade/degrade the registered user to a synced profile (no role, no password, no cookie)
	updates := map[string]interface{}{
		"role_id":       nil,
		"password_hash": "",
		"roblox_cookie": "",
		"is_approved":   false,
		"is_stealth":    false,
	}

	// Use map updates to force GORM to set NULL and empty strings
	if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal menghapus akun pengguna: " + err.Error()})
	}

	adminUsername, _ := c.Locals("username").(string)
	actionDesc := fmt.Sprintf("Akun pengguna @%s berhasil didegradasi/dihapus.", user.RobloxUsername)
	services.NotifyAdminAction(adminUsername, "Hapus Akun Pengguna", actionDesc)

	return c.JSON(fiber.Map{"message": "Akun pengguna berhasil dihapus (didegradasi menjadi profil terlacak)"})
}

func GetUserGameHistory(c *fiber.Ctx) error {
	userId := c.Params("id")
	mapName := strings.TrimSpace(c.Query("map_name", ""))

	if mapName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Parameter map_name wajib diisi"})
	}

	var logs []models.ActivityLog
	searchPattern := "%" + strings.ToLower(mapName) + "%"

	if err := database.DB.Preload("Map").
		Where("user_id = ? AND status = ? AND LOWER(game_name) LIKE ?", userId, "In-Game", searchPattern).
		Order("created_at desc").
		Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal mengambil riwayat permainan"})
	}

	type SessionResponse struct {
		ID        uint       `json:"id"`
		GameName  string     `json:"game_name"`
		StartTime time.Time  `json:"start_time"`
		EndTime   *time.Time `json:"end_time"`
		Duration  string     `json:"duration"`
	}

	var results []SessionResponse

	for _, log := range logs {
		var nextLog models.ActivityLog
		err := database.DB.Where("user_id = ? AND created_at > ?", log.UserID, log.CreatedAt).
			Order("created_at asc").
			First(&nextLog).Error

		var endTime *time.Time
		durationStr := "-"

		if err == nil {
			endTime = &nextLog.CreatedAt
			diff := nextLog.CreatedAt.Sub(log.CreatedAt)

			hours := int(diff.Hours())
			minutes := int(diff.Minutes()) % 60
			seconds := int(diff.Seconds()) % 60

			if hours > 0 {
				durationStr = fmt.Sprintf("%d jam %d menit %d detik", hours, minutes, seconds)
			} else if minutes > 0 {
				durationStr = fmt.Sprintf("%d menit %d detik", minutes, seconds)
			} else {
				durationStr = fmt.Sprintf("%d detik", seconds)
			}
		} else {
			var latestLog models.ActivityLog
			latestErr := database.DB.Where("user_id = ?", log.UserID).Order("created_at desc").First(&latestLog).Error
			if latestErr == nil && latestLog.ID == log.ID && latestLog.Status == "In-Game" {
				durationStr = "Sedang bermain..."
			} else {
				durationStr = "Selesai (tidak tercatat)"
			}
		}

		results = append(results, SessionResponse{
			ID:        log.ID,
			GameName:  log.GameName,
			StartTime: log.CreatedAt,
			EndTime:   endTime,
			Duration:  durationStr,
		})
	}

	return c.JSON(results)
}
