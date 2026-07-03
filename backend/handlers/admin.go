package handlers

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/apany/roblox-friend-tracker/cache"
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

	for _, u := range users {
		var uID uint64
		if u.CurrentUniverseID != nil {
			uID = *u.CurrentUniverseID
		}
		fmt.Printf("[CoPlayer Debug] User: %s (%s), GameName: '%s', UniverseID: %d\n", u.RobloxUsername, u.RobloxUserID, u.CurrentGameName, uID)
	}

	var allMaps []models.RobloxMap
	database.DB.Find(&allMaps)

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

	type GroupInfo struct {
		DisplayGameName string
		Players         []PlayerInfo
	}

	groupsMap := make(map[string]*GroupInfo)
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

		// Find matching map from DB (Roblox Map Database)
		var matchedMap *models.RobloxMap
		for i := range allMaps {
			m := &allMaps[i]
			// Direct ID match
			if u.CurrentUniverseID != nil && m.UniverseID != nil && *u.CurrentUniverseID == *m.UniverseID {
				matchedMap = m
				break
			}
			// String match (case-insensitive substring)
			mName := strings.ToLower(m.Name)
			gName := strings.ToLower(u.CurrentGameName)
			if len(mName) >= 3 && (strings.Contains(gName, mName) || strings.Contains(mName, gName)) {
				matchedMap = m
				break
			}
		}

		var key string
		var displayName = u.CurrentGameName

		if u.CurrentUniverseID != nil && *u.CurrentUniverseID > 0 {
			key = fmt.Sprintf("id_%d", *u.CurrentUniverseID)
			if matchedMap != nil {
				displayName = matchedMap.Name
			}
		} else if matchedMap != nil && matchedMap.UniverseID != nil && *matchedMap.UniverseID > 0 {
			key = fmt.Sprintf("id_%d", *matchedMap.UniverseID)
			displayName = matchedMap.Name
		} else {
			key = "name_" + u.CurrentGameName
		}

		if _, exists := groupsMap[key]; !exists {
			groupsMap[key] = &GroupInfo{
				DisplayGameName: displayName,
				Players:         []PlayerInfo{p},
			}
		} else {
			groupsMap[key].Players = append(groupsMap[key].Players, p)
		}
	}

	// Merge by resolved display name to prevent any duplicate card rendering in UI
	resMap := make(map[string][]PlayerInfo)
	for _, group := range groupsMap {
		name := strings.TrimSpace(group.DisplayGameName)
		if name == "" {
			name = "Unknown Game"
		}
		resMap[name] = append(resMap[name], group.Players...)
	}

	res := make([]GameGroup, 0)
	for gameName, players := range resMap {
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

func SearchHistoricalCoPlayers(c *fiber.Ctx) error {
	roleName, _ := c.Locals("role").(string)
	scopeFriendsOnly, _ := c.Locals("scope_friends_only").(bool)

	mapName := c.Query("map_name")
	dateStr := c.Query("date")       // YYYY-MM-DD
	hourVal := c.QueryInt("hour", 8) // 0-23

	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	// Parse date in local timezone
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		loc = time.Local
	}

	// T_start = YYYY-MM-DD HH:00:00
	tStart, err := time.ParseInLocation("2006-01-02 15:04:05", fmt.Sprintf("%s %02d:00:00", dateStr, hourVal), loc)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid date or hour format"})
	}
	tEnd := tStart.Add(1 * time.Hour)

	// Fetch all users
	var users []models.User
	userQuery := database.DB.Preload("Role")
	if roleName != "admin" {
		userQuery = userQuery.Where("is_stealth = ?", false)
	}
	if scopeFriendsOnly {
		requestingUserID := c.Locals("user_id")
		var friendIDs []uint
		database.DB.Model(&models.Friend{}).
			Where("user_id = ? AND status = 'active'", requestingUserID).
			Pluck("friend_id", &friendIDs)
		if len(friendIDs) == 0 {
			return c.JSON([]interface{}{})
		}
		userQuery = userQuery.Where("id IN ?", friendIDs)
	}
	if err := userQuery.Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch users"})
	}

	type PlayerInfo struct {
		ID                uint   `json:"id"`
		RobloxUserID      string `json:"roblox_user_id"`
		RobloxUsername    string `json:"roblox_username"`
		RobloxDisplayName string `json:"roblox_display_name"`
		AvatarURL         string `json:"avatar_url"`
		RoleName          string `json:"role_name"`
		PlayStartTime     string `json:"play_start_time"`
	}

	activePlayers := make([]PlayerInfo, 0)

	// Collect user IDs to query everything in batch
	userIDs := make([]uint, len(users))
	for i, u := range users {
		userIDs[i] = u.ID
	}

	if len(userIDs) == 0 {
		return c.JSON(activePlayers)
	}

	// 1. Get the single latest log ID before tStart for each user using DISTINCT ON
	var beforeLogIDs []uint
	if err := database.DB.Model(&models.ActivityLog{}).
		Where("user_id IN ? AND created_at < ?", userIDs, tStart).
		Order("user_id, created_at DESC").
		Select("DISTINCT ON (user_id) id").
		Find(&beforeLogIDs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch historical activity logs before start"})
	}

	// 2. Get all log IDs within the [tStart, tEnd] interval
	var intervalLogIDs []uint
	if err := database.DB.Model(&models.ActivityLog{}).
		Where("user_id IN ? AND created_at >= ? AND created_at <= ?", userIDs, tStart, tEnd).
		Pluck("id", &intervalLogIDs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch activity logs in time window"})
	}

	// 3. Load all these logs preloaded with their maps in chronological order (created_at asc)
	allLogIDs := append(beforeLogIDs, intervalLogIDs...)
	var allLogs []models.ActivityLog
	if len(allLogIDs) > 0 {
		if err := database.DB.Preload("Map").
			Where("id IN ?", allLogIDs).
			Order("created_at asc").
			Find(&allLogs).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load preloaded activity logs"})
		}
	}

	// Group the logs by UserID
	logsByUser := make(map[uint][]models.ActivityLog)
	for _, log := range allLogs {
		logsByUser[log.UserID] = append(logsByUser[log.UserID], log)
	}

	// For each user, check if they were in-game on the matched map during [tStart, tEnd]
	for _, u := range users {
		logs := logsByUser[u.ID]
		if len(logs) == 0 {
			continue
		}

		wasPlaying := false
		var sessionStart *time.Time

		var currentInGameLog *models.ActivityLog
		for i := 0; i < len(logs); i++ {
			log := logs[i]
			if log.Status == "In-Game" {
				if currentInGameLog != nil {
					// The previous In-Game session ended when this new session started!
					start := currentInGameLog.CreatedAt
					end := log.CreatedAt

					if start.Before(tEnd) && end.After(tStart) {
						currentGameName := currentInGameLog.GameName
						if currentInGameLog.Map != nil {
							currentGameName = currentInGameLog.Map.Name
						}

						if mapName == "" || strings.Contains(strings.ToLower(currentGameName), strings.ToLower(mapName)) {
							wasPlaying = true
							sessionStart = &start
							break
						}
					}
				}
				// Start the new In-Game session from this log
				currentInGameLog = &logs[i]
			} else {
				if currentInGameLog != nil {
					start := currentInGameLog.CreatedAt
					end := log.CreatedAt

					if start.Before(tEnd) && end.After(tStart) {
						currentGameName := currentInGameLog.GameName
						if currentInGameLog.Map != nil {
							currentGameName = currentInGameLog.Map.Name
						}

						if mapName == "" || strings.Contains(strings.ToLower(currentGameName), strings.ToLower(mapName)) {
							wasPlaying = true
							sessionStart = &start
							break
						}
					}
					currentInGameLog = nil
				}
			}
		}

		if currentInGameLog != nil && !wasPlaying {
			start := currentInGameLog.CreatedAt
			if start.Before(tEnd) {
				currentGameName := currentInGameLog.GameName
				if currentInGameLog.Map != nil {
					currentGameName = currentInGameLog.Map.Name
				}
				if mapName == "" || strings.Contains(strings.ToLower(currentGameName), strings.ToLower(mapName)) {
					wasPlaying = true
					sessionStart = &start
				}
			}
		}

		if wasPlaying {
			roleName := "Synced Friend"
			if u.RoleID != nil {
				roleName = u.Role.Name
			}
			startTimeStr := ""
			if sessionStart != nil {
				startTimeStr = sessionStart.In(loc).Format("15:04:05")
			}
			activePlayers = append(activePlayers, PlayerInfo{
				ID:                u.ID,
				RobloxUserID:      u.RobloxUserID,
				RobloxUsername:    u.RobloxUsername,
				RobloxDisplayName: u.RobloxDisplayName,
				AvatarURL:         u.AvatarURL,
				RoleName:          roleName,
				PlayStartTime:     startTimeStr,
			})
		}
	}

	return c.JSON(activePlayers)
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

func GetAdminStats(c *fiber.Ctx) error {
	var totalUsers int64
	var registeredUsers int64
	var stealthCount int64

	database.DB.Model(&models.User{}).Count(&totalUsers)
	database.DB.Model(&models.User{}).Where("role_id IS NOT NULL").Count(&registeredUsers)
	database.DB.Model(&models.User{}).Where("is_stealth = ?", true).Count(&stealthCount)

	// Presence counts
	type PresenceCount struct {
		CurrentPresence string
		Count           int64
	}
	var presences []PresenceCount
	database.DB.Model(&models.User{}).Select("current_presence, count(*) as count").Group("current_presence").Scan(&presences)

	presenceCounts := make(map[string]int64)
	for _, p := range presences {
		presenceCounts[p.CurrentPresence] = p.Count
	}

	// Role counts (only for registered users)
	type RoleCount struct {
		Name  string
		Count int64
	}
	var roles []RoleCount
	database.DB.Model(&models.User{}).
		Select("roles.name as name, count(*) as count").
		Joins("JOIN roles ON roles.id = users.role_id").
		Group("roles.name").
		Scan(&roles)

	roleCounts := make(map[string]int64)
	for _, r := range roles {
		roleCounts[r.Name] = r.Count
	}

	// Registration Growth (using GORM Group by Month)
	type GrowthCount struct {
		Month string
		Count int64
	}
	var growth []GrowthCount
	database.DB.Model(&models.User{}).
		Select("TO_CHAR(created_at, 'YYYY-MM') as month, count(*) as count").
		Where("role_id IS NOT NULL").
		Group("TO_CHAR(created_at, 'YYYY-MM')").
		Order("TO_CHAR(created_at, 'YYYY-MM') asc").
		Scan(&growth)

	growthCounts := make(map[string]int64)
	for _, g := range growth {
		if g.Month != "" {
			growthCounts[g.Month] = g.Count
		}
	}

	return c.JSON(fiber.Map{
		"total_users":      totalUsers,
		"registered_users": registeredUsers,
		"stealth_count":    stealthCount,
		"presence_counts":  presenceCounts,
		"role_counts":      roleCounts,
		"growth_counts":    growthCounts,
	})
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

func GetFriendsNetworkGraph(c *fiber.Ctx) error {
	var dbUsers []models.User
	if err := database.DB.Preload("Role").Find(&dbUsers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal mengambil data pengguna"})
	}

	var dbFriends []models.Friend
	if err := database.DB.Where("status = ?", "active").Find(&dbFriends).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal mengambil data relasi pertemanan"})
	}

	type Node struct {
		ID          string `json:"id"`
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		AvatarURL   string `json:"avatar_url"`
		Presence    string `json:"presence"`
		GameName    string `json:"game_name"`
		Role        string `json:"role"`
	}

	type Link struct {
		Source string `json:"source"`
		Target string `json:"target"`
		Type   string `json:"type"`
	}

	var nodes []Node
	for _, u := range dbUsers {
		roleName := "Friend"
		if u.RoleID != nil && u.Role.Name != "" {
			roleName = u.Role.Name
		} else if u.PasswordHash != "" {
			roleName = "User"
		}

		nodes = append(nodes, Node{
			ID:          fmt.Sprintf("%d", u.ID),
			Username:    u.RobloxUsername,
			DisplayName: u.RobloxDisplayName,
			AvatarURL:   u.AvatarURL,
			Presence:    u.CurrentPresence,
			GameName:    u.CurrentGameName,
			Role:        roleName,
		})
	}

	var links []Link
	for _, f := range dbFriends {
		links = append(links, Link{
			Source: fmt.Sprintf("%d", f.UserID),
			Target: fmt.Sprintf("%d", f.FriendID),
			Type:   "friendship",
		})
	}

	return c.JSON(fiber.Map{
		"nodes": nodes,
		"links": links,
	})
}

func GetCronStatus(c *fiber.Ctx) error {
	ctx := cache.Ctx
	rdb := cache.RDB

	if rdb == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Redis connection not active"})
	}

	// 1. Get Roblox Rate Limit status
	remainingHits := services.GetRemainingHits()

	// 2. Fetch keys for cron metadata
	keys, err := rdb.Keys(ctx, "cron_metadata:*").Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch cron status keys"})
	}

	type JobMetadata struct {
		JobName        string `json:"job_name"`
		InstanceID     int    `json:"instance_id"`
		Status         string `json:"status"`
		StartTime      string `json:"start_time"`
		LastRun        string `json:"last_run"`
		DurationMs     int64  `json:"duration_ms"`
		ProcessedCount int    `json:"processed_count"`
		FailedCount    int    `json:"failed_count"`
		ChangeCount    int    `json:"change_count"`
	}

	var jobs []JobMetadata
	for _, key := range keys {
		data, err := rdb.HGetAll(ctx, key).Result()
		if err != nil {
			continue
		}

		instID, _ := strconv.Atoi(data["instance_id"])
		durMs, _ := strconv.ParseInt(data["duration_ms"], 10, 64)
		procCount, _ := strconv.Atoi(data["processed_count"])
		failCount, _ := strconv.Atoi(data["failed_count"])
		changeCount, _ := strconv.Atoi(data["change_count"])

		jobs = append(jobs, JobMetadata{
			JobName:        data["job_name"],
			InstanceID:     instID,
			Status:         data["status"],
			StartTime:      data["start_time"],
			LastRun:        data["last_run"],
			DurationMs:     durMs,
			ProcessedCount: procCount,
			FailedCount:    failCount,
			ChangeCount:    changeCount,
		})
	}

	// Read instance configuration dynamically from cache
	instanceID, totalInstances := cache.GetClusterConfig()

	return c.JSON(fiber.Map{
		"remaining_hits":  remainingHits,
		"max_hits":        80,
		"instance_id":     instanceID,
		"total_instances": totalInstances,
		"jobs":            jobs,
	})
}

func ListAutoBackups(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	backupDir := "./uploads/db"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to access backup directory"})
	}

	files, err := os.ReadDir(backupDir)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read backup files"})
	}

	type BackupFile struct {
		Filename  string    `json:"filename"`
		Size      int64     `json:"size"`
		CreatedAt time.Time `json:"created_at"`
	}

	var backups []BackupFile
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".sql") {
			continue
		}
		info, err := f.Info()
		if err != nil {
			continue
		}

		backups = append(backups, BackupFile{
			Filename:  f.Name(),
			Size:      info.Size(),
			CreatedAt: info.ModTime(),
		})
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].CreatedAt.After(backups[j].CreatedAt)
	})

	return c.JSON(backups)
}

func DownloadAutoBackup(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	filename := c.Params("filename")
	if filename == "" || strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid backup filename"})
	}

	path := filepath.Join("./uploads/db", filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Backup file not found"})
	}

	c.Set("Content-Disposition", "attachment; filename="+filename)
	c.Set("Content-Type", "application/sql")
	return c.SendFile(path)
}

func DeleteAutoBackup(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	filename := c.Params("filename")
	if filename == "" || strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid backup filename"})
	}

	path := filepath.Join("./uploads/db", filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Backup file not found"})
	}

	if err := os.Remove(path); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete backup file: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Backup file deleted successfully"})
}

func TriggerAutoBackup(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	backupDir := "./uploads/db"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create backup directory"})
	}

	filename := fmt.Sprintf("backup_%s.sql", time.Now().Format("20060102_150405"))
	path := filepath.Join(backupDir, filename)

	if err := services.RunDbBackup(path); err != nil {
		fmt.Printf("[AutoBackup Error] Trigger manual backup failed: %v\n", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Backup failed: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Auto-backup triggered and saved successfully", "filename": filename})
}

func RestoreAutoBackup(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	filename := c.Params("filename")
	if filename == "" || strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid backup filename"})
	}

	path := filepath.Join("./uploads/db", filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Backup file not found"})
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

	cleanCmd := exec.Command("psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;")
	cleanCmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var cleanStderr bytes.Buffer
	cleanCmd.Stderr = &cleanStderr
	if err := cleanCmd.Run(); err != nil {
		fmt.Printf("[Restore Error] Failed to drop existing schema: %v (details: %s)\n", err, cleanStderr.String())
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to drop existing schema: " + err.Error() + " (details: " + cleanStderr.String() + ")",
		})
	}

	restoreCmd := exec.Command("psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-f", path)
	restoreCmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var restoreStderr bytes.Buffer
	restoreCmd.Stderr = &restoreStderr
	if err := restoreCmd.Run(); err != nil {
		fmt.Printf("[Restore Error] Failed to run restore command: %v (details: %s)\n", err, restoreStderr.String())
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to run restore command: " + err.Error() + " (details: " + restoreStderr.String() + ")",
		})
	}

	return c.JSON(fiber.Map{"message": "Database successfully restored from archive: " + filename})
}

func GetSystemSettings(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	var settings []models.SystemSetting
	if err := database.DB.Find(&settings).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch settings"})
	}

	res := make(map[string]interface{})
	for _, s := range settings {
		if s.Key == "global_roblox_cookie" {
			if s.Value != "" {
				res[s.Key] = "********"
			} else {
				res[s.Key] = ""
			}
		} else if s.Type == "boolean" {
			val, _ := strconv.ParseBool(s.Value)
			res[s.Key] = val
		} else if s.Type == "integer" {
			val, _ := strconv.Atoi(s.Value)
			res[s.Key] = val
		} else {
			res[s.Key] = s.Value
		}
	}

	return c.JSON(res)
}

func UpdateSystemSettings(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	var input map[string]interface{}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	for k, v := range input {
		valStr := fmt.Sprintf("%v", v)

		// Handle security mask for global_roblox_cookie
		if k == "global_roblox_cookie" {
			if valStr == "********" {
				continue // Skip update if unchanged
			}
			if valStr != "" {
				// Validate Roblox Cookie
				_, _, err := services.ValidateCookie(valStr)
				if err != nil {
					return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cookie Roblox global tidak valid: " + err.Error()})
				}
			}
		}

		if err := services.SetSystemSetting(k, valStr); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Failed to update setting %s", k)})
		}
	}

	return c.JSON(fiber.Map{"message": "Pengaturan sistem berhasil diperbarui"})
}
