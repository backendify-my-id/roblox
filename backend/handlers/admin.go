package handlers

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
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
		IsApproved        bool      `json:"is_approved"`
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
			IsApproved:        u.IsApproved,
			RoleName:          roleName,
			IsRegistered:      isRegistered,
			FriendsCount:      len(u.Friends),
			AdminNote:         u.AdminNote,
			CreatedAt:         u.CreatedAt.Format("02/01/2006, 15:04:05"),
		})
	}

	return c.JSON(res)
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
	if err := database.DB.Preload("Map").Where("user_id = ?", userId).Order("created_at desc").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
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

func BackupDatabase(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
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
		if execErr, ok := err.(*exec.Error); ok && execErr.Err == exec.ErrNotFound {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "PostgreSQL client tool 'pg_dump' is not installed or not found in system PATH",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to run pg_dump: " + err.Error() + " (details: " + stderr.String() + ")",
		})
	}

	filename := fmt.Sprintf("roblox_tracker_backup_%s.sql", time.Now().Format("2006-01-02_15-04-05"))
	c.Set("Content-Disposition", "attachment; filename="+filename)
	c.Set("Content-Type", "application/sql")
	return c.Send(out)
}

func RestoreDatabase(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	file, err := c.FormFile("backup")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to receive uploaded file: " + err.Error()})
	}

	// DoS mitigation: restrict upload size to 50MB
	if file.Size > 50*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Backup file is too large (maximum 50MB)"})
	}

	// Create temp directory if it doesn't exist
	tempDir := "./temp"
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create temp directory"})
	}

	// Save uploaded file
	tempFile := fmt.Sprintf("%s/restore_%d.sql", tempDir, time.Now().UnixNano())
	if err := c.SaveFile(file, tempFile); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save backup file: " + err.Error()})
	}
	defer os.Remove(tempFile)

	host := os.Getenv("DB_HOST")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	port := os.Getenv("DB_PORT")

	if host == "" { host = "localhost" }
	if user == "" { user = "roblox_user" }
	if password == "" { password = "roblox_password" }
	if dbname == "" { dbname = "roblox_tracker" }
	if port == "" { port = "5432" }

	// Step 1: Clean the database by dropping and recreating the public schema
	cleanCmd := exec.Command("psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;")
	cleanCmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var cleanStderr bytes.Buffer
	cleanCmd.Stderr = &cleanStderr
	if err := cleanCmd.Run(); err != nil {
		if execErr, ok := err.(*exec.Error); ok && execErr.Err == exec.ErrNotFound {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "PostgreSQL client tool 'psql' is not installed or not found in system PATH",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to clean database: " + err.Error() + " (details: " + cleanStderr.String() + ")",
		})
	}

	// Step 2: Run psql to restore the backup file
	restoreCmd := exec.Command("psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-f", tempFile)
	restoreCmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var restoreStderr bytes.Buffer
	restoreCmd.Stderr = &restoreStderr
	if err := restoreCmd.Run(); err != nil {
		if execErr, ok := err.(*exec.Error); ok && execErr.Err == exec.ErrNotFound {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "PostgreSQL client tool 'psql' is not installed or not found in system PATH",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to restore database: " + err.Error() + " (details: " + restoreStderr.String() + ")",
		})
	}

	// Step 3: Self-healing reconnect & re-migrate to avoid stale connection prepared statement cache issues
	database.ConnectDB()

	return c.JSON(fiber.Map{"message": "Database successfully restored from backup!"})
}

func GetPlayingTogether(c *fiber.Ctx) error {
	scopeFriendsOnly, _ := c.Locals("scope_friends_only").(bool)
	roleName, _ := c.Locals("role").(string)

	users := make([]models.User, 0)
	query := database.DB.Preload("Role").
		Where("current_presence = ? AND current_game_name IS NOT NULL AND current_game_name != ? AND current_game_name != ?", "In-Game", "", "-")

	// Non-admin (Moderator/Observer) tidak boleh melihat user yang mode siluman aktif
	if roleName != "admin" {
		query = query.Where("is_stealth = ?", false)
	}

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

	type Request struct {
		IsReviewed bool   `json:"is_reviewed"`
		AdminNotes string `json:"admin_notes"`
	}

	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	adminNotes := strings.TrimSpace(req.AdminNotes)
	if len(adminNotes) > 2000 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Admin notes too long (maximum 2000 characters)"})
	}

	result := database.DB.Model(&models.ShadowActivity{}).
		Where("id = ?", id).
		Select("is_reviewed", "admin_notes").
		Updates(models.ShadowActivity{
			IsReviewed: req.IsReviewed,
			AdminNotes: adminNotes,
		})

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update shadow activity: " + result.Error.Error()})
	}
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Shadow activity not found"})
	}

	var activity models.ShadowActivity
	if err := database.DB.Preload("User").First(&activity, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch updated shadow activity"})
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

// GetCronLogFiles lists all available daily cron log files, sorted descending.
func GetCronLogFiles(c *fiber.Ctx) error {
	logDir := filepath.Join(".", "logs")
	files, err := os.ReadDir(logDir)
	if err != nil {
		if os.IsNotExist(err) {
			return c.JSON([]string{})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read logs directory: " + err.Error()})
	}

	var logFiles []string
	for _, f := range files {
		if !f.IsDir() && strings.HasPrefix(f.Name(), "cron_") && strings.HasSuffix(f.Name(), ".log") {
			logFiles = append(logFiles, f.Name())
		}
	}

	sort.Slice(logFiles, func(i, j int) bool {
		return logFiles[i] > logFiles[j]
	})

	return c.JSON(logFiles)
}

// GetCronLogContent returns the raw content of a specified log file.
func GetCronLogContent(c *fiber.Ctx) error {
	fileName := c.Params("filename")

	// Validate filename to prevent path traversal
	if strings.Contains(fileName, "..") || strings.Contains(fileName, "/") || strings.Contains(fileName, "\\") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid log filename"})
	}

	filePath := filepath.Join(".", "logs", fileName)
	content, err := os.ReadFile(filePath)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Log file not found or could not be read: " + err.Error()})
	}

	return c.SendString(string(content))
}
