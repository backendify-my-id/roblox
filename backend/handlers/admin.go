package handlers

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
)

func GetAllUsers(c *fiber.Ctx) error {

	var users []models.User
	// Preload Role and Friends to get a count or details
	if err := database.DB.Preload("Role").Preload("Friends").Order("created_at desc").Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch users"})
	}

	// Buat response custom agar lebih bersih (menghitung jumlah teman)
	type UserResponse struct {
		ID                uint      `json:"id"`
		RobloxUserID      string    `json:"roblox_user_id"`
		RobloxUsername    string    `json:"roblox_username"`
		RobloxDisplayName string    `json:"roblox_display_name"`
		AvatarURL         string    `json:"avatar_url"`
		CurrentPresence   string    `json:"current_presence"`
		CurrentGameName   string    `json:"current_game_name"`
		IsStealth         bool      `json:"is_stealth"`
		RoleName          string    `json:"role_name"`
		IsRegistered      bool      `json:"is_registered"`
		FriendsCount      int       `json:"friends_count"`
		AdminNote         string    `json:"admin_note"`
		CreatedAt         string    `json:"created_at"`
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
			RoleName:          roleName,
			IsRegistered:      isRegistered,
			FriendsCount:      len(u.Friends),
			AdminNote:         u.AdminNote,
			CreatedAt:         u.CreatedAt.Format("02/01/2006, 15:04:05"),
		})
	}

	return c.JSON(res)
}

func GetUserActivityLogs(c *fiber.Ctx) error {

	userId := c.Params("id")
	offset := c.QueryInt("offset", 0)
	limit := 100

	var logs []models.ActivityLog
	if err := database.DB.Where("user_id = ?", userId).Order("created_at desc").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
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
		ID                uint   `json:"id"`
		FriendID          uint   `json:"friend_id"`
		FriendRobloxID    string `json:"friend_roblox_id"`
		FriendUsername    string `json:"friend_username"`
		FriendDisplayName string `json:"friend_display_name"`
		AvatarURL         string `json:"avatar_url"`
		Status            string `json:"status"`
		Note              string `json:"note"`
		CreatedAt         string `json:"created_at"`
	}

	var res []FriendResponse
	for _, f := range friends {
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
		})
	}

	return c.JSON(res)
}

func GetUserTrackers(c *fiber.Ctx) error {

	userId := c.Params("id")
	
	type TrackerResult struct {
		ID                uint   `json:"id"`
		RobloxUserID      string `json:"roblox_user_id"`
		RobloxUsername    string `json:"roblox_username"`
		RobloxDisplayName string `json:"roblox_display_name"`
		AvatarURL         string `json:"avatar_url"`
		RoleName          string `json:"role_name"`
		Status            string `json:"status"`
		Note              string `json:"note"`
		CreatedAt         string `json:"created_at"`
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
	
	// Format time string if needed, but DB.Raw returns time in a string-compatible struct if scanned directly to string,
	// though standard time format might be ugly (RFC3339). Let's use a struct with time.Time and format it.

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

	var user models.User
	if err := database.DB.First(&user, userId).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	user.AdminNote = input.AdminNote
	if err := database.DB.Save(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update admin note"})
	}

	return c.JSON(fiber.Map{"message": "Admin note updated successfully", "admin_note": user.AdminNote})
}

func BackupDatabase(c *fiber.Ctx) error {
	role := c.Locals("role").(string)
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	host := os.Getenv("DB_HOST")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	port := os.Getenv("DB_PORT")

	if host == "" {
		host = "localhost"
	}
	if user == "" {
		user = "roblox_user"
	}
	if password == "" {
		password = "roblox_password"
	}
	if dbname == "" {
		dbname = "roblox_tracker"
	}
	if port == "" {
		port = "5432"
	}

	cmd := exec.Command("pg_dump", "-h", host, "-p", port, "-U", user, "-d", dbname, "-F", "p")
	cmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	out, err := cmd.Output()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to run pg_dump: " + err.Error() + " (details: " + stderr.String() + ")",
		})
	}

	filename := fmt.Sprintf("roblox_tracker_backup_%s.sql", time.Now().Format("2006-01-02_15-04-05"))
	c.Set("Content-Disposition", "attachment; filename="+filename)
	c.Set("Content-Type", "application/sql")
	return c.Send(out)
}

func GetPlayingTogether(c *fiber.Ctx) error {
	scopeFriendsOnly, _ := c.Locals("scope_friends_only").(bool)

	users := make([]models.User, 0)
	query := database.DB.Preload("Role").
		Where("current_presence = ? AND current_game_name IS NOT NULL AND current_game_name != ? AND current_game_name != ?", "In-Game", "", "-")

	if scopeFriendsOnly {
		// Hanya tampilkan teman dari user yang sedang login
		requestingUserID := c.Locals("user_id")
		var friendIDs []uint
		database.DB.Model(&models.Friend{}).
			Where("user_id = ? AND status = 'active'", requestingUserID).
			Pluck("friend_id", &friendIDs)
		if len(friendIDs) == 0 {
			return c.JSON([]interface{}{})
		}
		query = query.Where("id IN ?", friendIDs)
	}

	if err := query.Order("current_game_name asc, roblox_username asc").Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch playing users"})
	}

	type PlayerInfo struct {
		ID                uint   `json:"id"`
		RobloxUserID      string `json:"roblox_user_id"`
		RobloxUsername    string `json:"roblox_username"`
		RobloxDisplayName string `json:"roblox_display_name"`
		AvatarURL         string `json:"avatar_url"`
		RoleName          string `json:"role_name"`
	}

	type GameGroup struct {
		GameName string       `json:"game_name"`
		Players  []PlayerInfo `json:"players"`
	}

	groupsMap := make(map[string][]PlayerInfo)
	for _, u := range users {
		roleName := "Synced Friend"
		if u.RoleID != nil {
			roleName = u.Role.Name
		}
		p := PlayerInfo{
			ID:                u.ID,
			RobloxUserID:      u.RobloxUserID,
			RobloxUsername:    u.RobloxUsername,
			RobloxDisplayName: u.RobloxDisplayName,
			AvatarURL:         u.AvatarURL,
			RoleName:          roleName,
		}
		groupsMap[u.CurrentGameName] = append(groupsMap[u.CurrentGameName], p)
	}

	res := make([]GameGroup, 0)
	for gameName, players := range groupsMap {
		res = append(res, GameGroup{
			GameName: gameName,
			Players:  players,
		})
	}

	// Urutkan berdasarkan jumlah pemain terbanyak (descending)
	sort.Slice(res, func(i, j int) bool {
		return len(res[i].Players) > len(res[j].Players)
	})

	return c.JSON(res)
}

func GetShadowActivities(c *fiber.Ctx) error {
	scopeFriendsOnly, _ := c.Locals("scope_friends_only").(bool)

	results := make([]models.ShadowActivity, 0)
	query := database.DB.Preload("User")

	if scopeFriendsOnly {
		// Hanya tampilkan insiden siluman dari teman user yang sedang login
		requestingUserID := c.Locals("user_id")
		var friendIDs []uint
		database.DB.Model(&models.Friend{}).
			Where("user_id = ? AND status = 'active'", requestingUserID).
			Pluck("friend_id", &friendIDs)
		if len(friendIDs) == 0 {
			return c.JSON([]interface{}{})
		}
		query = query.Where("user_id IN ?", friendIDs)
	}

	if err := query.Order("created_at DESC").Find(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch shadow activities: " + err.Error()})
	}

	return c.JSON(results)
}

func ReviewShadowActivity(c *fiber.Ctx) error {
	id := c.Params("id")
	var activity models.ShadowActivity
	if err := database.DB.First(&activity, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Shadow activity not found"})
	}

	type Request struct {
		IsReviewed bool   `json:"is_reviewed"`
		AdminNotes string `json:"admin_notes"`
	}

	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	activity.IsReviewed = req.IsReviewed
	activity.AdminNotes = req.AdminNotes

	if err := database.DB.Save(&activity).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update shadow activity: " + err.Error()})
	}

	return c.JSON(activity)
}

func UpdateUserRole(c *fiber.Ctx) error {
	userId := c.Params("id")

	var input struct {
		RoleName string `json:"role_name"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	var user models.User
	if err := database.DB.First(&user, userId).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	var role models.Role
	if err := database.DB.Where("name = ?", input.RoleName).First(&role).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Role not found"})
	}

	user.RoleID = &role.ID
	if err := database.DB.Save(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update user role"})
	}

	return c.JSON(fiber.Map{
		"message": "User role updated successfully",
		"role":    role.Name,
	})
}
