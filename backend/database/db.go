package database

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/utils"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func ConnectDB() {
	// Force Go runtime's local timezone to WIB (Western Indonesian Time / Asia/Jakarta / UTC+7)
	time.Local = time.FixedZone("WIB", 7*60*60)

	// Close existing DB pool to avoid connection leaks during reconnect / database restores
	if DB != nil {
		if sqlDB, err := DB.DB(); err == nil && sqlDB != nil {
			log.Println("Closing existing database connection pool before reconnecting...")
			sqlDB.Close()
		}
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

	defaultDsn := fmt.Sprintf("host=%s user=%s password=%s dbname=postgres port=%s sslmode=disable TimeZone=Asia/Jakarta",
		host, user, password, port)

	defaultDB, err := gorm.Open(postgres.Open(defaultDsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Error),
	})
	if err == nil {
		var count int64
		defaultDB.Raw("SELECT count(*) FROM pg_database WHERE datname = ?", dbname).Scan(&count)
		if count == 0 {
			utils.LogStartup("Database %s does not exist, creating...", dbname)
			defaultDB.Exec(fmt.Sprintf("CREATE DATABASE %s", dbname))
		}

		sqlDefaultDB, _ := defaultDB.DB()
		if sqlDefaultDB != nil {
			sqlDefaultDB.Close()
		}
	} else {
		utils.LogStartup("Warning: failed to connect to default postgres db to ensure creation: %v", err)
	}

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Jakarta",
		host, user, password, dbname, port)

	dbWriter := utils.GetDatabaseLogWriter()
	gormLogger := logger.New(
		log.New(dbWriter, "\r\n", log.LstdFlags),
		logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: false,
			Colorful:                  false,
		},
	)

	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		log.Fatal("Failed to connect to PostgreSQL database: ", err)
	}

	sqlDB, err := DB.DB()
	if err != nil {
		log.Fatal("Failed to get DB instance: ", err)
	}

	// Based on PRD requirements
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(20)

	utils.LogStartup("Database connection established")

	// Clean up duplicate friend records to ensure we can safely apply the unique index
	DB.Exec(`
		DELETE FROM friends a USING friends b 
		WHERE a.id > b.id 
		  AND a.user_id = b.user_id 
		  AND a.friend_id = b.friend_id
	`)

	err = DB.AutoMigrate(
		&models.Permission{},
		&models.Role{},
		&models.User{},
		&models.Friend{},
		&models.ActivityLog{},
		&models.ProfileChangeLog{},
		&models.ShadowActivity{},
		&models.RobloxMap{},
		&models.GameList{},
		&models.GameListMember{},
		&models.GameEntry{},
		&models.GameMedia{},
		&models.GameReview{},
		&models.SystemSetting{},
		&models.FeatureUsage{},
		&models.RobloxConversation{},
		&models.RobloxChatMessage{},
		&models.RobloxConversationParticipant{},
	)
	if err != nil {
		log.Fatal("Failed to auto migrate database schemas: ", err)
	}
	log.Println("Database schemas auto migrated")

	// Custom data migration to normalize legacy game_entries name/roblox_link to RobloxMap

	seedRolesAndPermissions(DB)
	seedSystemSettings(DB)
	// backfillShadowActivities(DB)
}

func backfillShadowActivities(db *gorm.DB) {
	type TempShadow struct {
		UserID    uint
		OldAvatar string
		NewAvatar string
		CreatedAt time.Time
	}

	// Query ini menerapkan threshold 20 menit yang sama dengan deteksi real-time:
	// hanya catat insiden siluman di mana user sudah berada dalam status Offline
	// selama >= 20 menit sebelum avatar berubah.
	query := `
		SELECT * FROM (
			SELECT 
				pcl.user_id,
				pcl.old_value  AS old_avatar,
				pcl.new_value  AS new_avatar,
				pcl.created_at,
				COALESCE(
					(
						SELECT status 
						FROM activity_logs al 
						WHERE al.user_id = pcl.user_id
						  AND al.created_at <= pcl.created_at 
						ORDER BY al.created_at DESC 
						LIMIT 1
					), 'Offline'
				) AS presence_status,
				COALESCE(
					(
						-- Kapan user MASUK ke status Offline sebelum perubahan avatar ini
						SELECT al.created_at
						FROM activity_logs al
						WHERE al.user_id = pcl.user_id
						  AND al.created_at <= pcl.created_at
						  AND al.status = 'Offline'
						ORDER BY al.created_at DESC
						LIMIT 1
					), pcl.created_at - INTERVAL '24 hours'
				) AS went_offline_at
			FROM profile_change_logs pcl
			WHERE pcl.change_type = 'avatar'
		) AS sub
		WHERE sub.presence_status = 'Offline'
		  AND EXTRACT(EPOCH FROM (sub.created_at - sub.went_offline_at)) >= 1200
	`

	var historis []TempShadow
	if err := db.Raw(query).Scan(&historis).Error; err != nil {
		log.Printf("[Backfill] Warning: gagal mengambil data shadow activities historis: %v", err)
		return
	}

	count := 0
	for _, h := range historis {
		var exists int64
		db.Model(&models.ShadowActivity{}).
			Where("user_id = ? AND created_at = ?", h.UserID, h.CreatedAt).
			Count(&exists)

		if exists == 0 {
			dbLog := models.ShadowActivity{
				UserID:     h.UserID,
				OldAvatar:  h.OldAvatar,
				NewAvatar:  h.NewAvatar,
				IsReviewed: false,
				AdminNotes: "",
				CreatedAt:  h.CreatedAt,
			}
			if err := db.Create(&dbLog).Error; err == nil {
				count++
			}
		}
	}

	if count > 0 {
		log.Printf("[Backfill] Sukses memigrasi %d data shadow activities historis ke tabel baru.\n", count)
	}
}

func seedRolesAndPermissions(db *gorm.DB) {
	// 1. Seed Permissions
	perms := []models.Permission{
		{Code: "view_users_list", Description: "Melihat daftar pengguna terdaftar"},
		{Code: "view_playing_together", Description: "Mengakses data Co-Players (Main Bersama)"},
		{Code: "view_shadow_activities", Description: "Mengakses log insiden siluman"},
		{Code: "review_shadow_activities", Description: "Menandai insiden siluman sebagai selesai/ditinjau"},
		{Code: "manage_user_permissions", Description: "Mengubah role dan hak akses pengguna"},
		{Code: "view_scope_friends_only", Description: "Membatasi tampilan Co-Players & Shadow Activity hanya ke daftar teman sendiri"},
	}

	for _, p := range perms {
		var existing models.Permission
		if err := db.Where("code = ?", p.Code).First(&existing).Error; err != nil {
			db.Create(&p)
			log.Printf("Seeded permission: %s", p.Code)
		} else {
			existing.Description = p.Description
			db.Save(&existing)
		}
	}

	// 2. Fetch seeded permissions
	var viewUsers, viewPlaying, viewShadow, reviewShadow, manageUser, viewScopeFriends models.Permission
	db.Where("code = ?", "view_users_list").First(&viewUsers)
	db.Where("code = ?", "view_playing_together").First(&viewPlaying)
	db.Where("code = ?", "view_shadow_activities").First(&viewShadow)
	db.Where("code = ?", "review_shadow_activities").First(&reviewShadow)
	db.Where("code = ?", "manage_user_permissions").First(&manageUser)
	db.Where("code = ?", "view_scope_friends_only").First(&viewScopeFriends)

	// 3. Seed Roles
	rolePermsMap := map[string][]models.Permission{
		"admin":     {viewUsers, viewPlaying, viewShadow, reviewShadow, manageUser},
		"moderator": {viewPlaying, viewShadow, reviewShadow},
		// observer: dapat melihat Co-Players & Shadow Activity, namun hanya teman sendiri
		"observer": {viewPlaying, viewShadow, viewScopeFriends},
		"user":     {},
	}

	for roleName, permissions := range rolePermsMap {
		var role models.Role
		if err := db.Preload("Permissions").Where("name = ?", roleName).First(&role).Error; err != nil {
			role = models.Role{Name: roleName, Permissions: permissions}
			db.Create(&role)
			log.Printf("Seeded role: %s with %d permissions", roleName, len(permissions))
		} else {
			db.Model(&role).Association("Permissions").Replace(permissions)
		}
	}
}

func seedSystemSettings(db *gorm.DB) {
	defaultSettings := []models.SystemSetting{
		{Key: "app_name", Value: "Roblox Tracker App", Type: "string"},
		{Key: "enable_registration", Value: "true", Type: "boolean"},
		{Key: "require_admin_approval", Value: "true", Type: "boolean"},
		{Key: "shadow_activity_threshold", Value: "20", Type: "integer"},
		{Key: "discord_webhook_url", Value: "", Type: "string"},
		{Key: "maintenance_mode", Value: "false", Type: "boolean"},
		{Key: "global_roblox_cookie", Value: "", Type: "string"},
		{Key: "presence_sync_interval", Value: "1m", Type: "string"},
		{Key: "friend_list_sync_interval", Value: "15m", Type: "string"},
		{Key: "avatar_sync_interval", Value: "15m", Type: "string"},
		{Key: "profile_sync_interval", Value: "60m", Type: "string"},
		{Key: "chat_sync_interval", Value: "10m", Type: "string"},
		{Key: "log_retention_days", Value: "30", Type: "integer"},
		{Key: "profile_log_retention_days", Value: "90", Type: "integer"},
		{Key: "discord_notify_shadow_only", Value: "false", Type: "boolean"},
		{Key: "discord_notify_online_offline", Value: "true", Type: "boolean"},
		{Key: "discord_notify_game_changed", Value: "true", Type: "boolean"},
		{Key: "discord_notify_admin_actions", Value: "true", Type: "boolean"},
		{Key: "session_timeout_hours", Value: "24", Type: "integer"},
	}

	for _, s := range defaultSettings {
		var existing models.SystemSetting
		if err := db.Where("key = ?", s.Key).First(&existing).Error; err != nil {
			s.UpdatedAt = time.Now()
			db.Create(&s)
			log.Printf("Seeded system setting: %s = %s (%s)", s.Key, s.Value, s.Type)
		}
	}
}
