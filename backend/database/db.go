package database

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/apany/roblox-friend-tracker/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func ConnectDB() {
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

	defaultDsn := fmt.Sprintf("host=%s user=%s password=%s dbname=postgres port=%s sslmode=disable TimeZone=UTC",
		host, user, password, port)

	defaultDB, err := gorm.Open(postgres.Open(defaultDsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Error),
	})
	if err == nil {
		var count int64
		defaultDB.Raw("SELECT count(*) FROM pg_database WHERE datname = ?", dbname).Scan(&count)
		if count == 0 {
			log.Printf("Database %s does not exist, creating...", dbname)
			defaultDB.Exec(fmt.Sprintf("CREATE DATABASE %s", dbname))
		}

		sqlDefaultDB, _ := defaultDB.DB()
		if sqlDefaultDB != nil {
			sqlDefaultDB.Close()
		}
	} else {
		log.Printf("Warning: failed to connect to default postgres db to ensure creation: %v", err)
	}

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=UTC",
		host, user, password, dbname, port)

	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Error),
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

	log.Println("Database connection established")

	// log.Println("Dropping old tables to apply breaking schema changes...")d
	// DB.Migrator().DropTable(&models.ActivityLog{}, &models.ProfileChangeLog{}, &models.Friend{}, &models.User{})

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
	)
	if err != nil {
		log.Fatal("Failed to auto migrate database schemas: ", err)
	}
	log.Println("Database schemas auto migrated")

	// Custom data migration to normalize legacy game_entries name/roblox_link to RobloxMap
	migrateGameEntriesToRobloxMap(DB)

	seedRolesAndPermissions(DB)
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

func migrateGameEntriesToRobloxMap(db *gorm.DB) {
	// 1. Check if "name" column exists in "game_entries"
	if !db.Migrator().HasColumn(&models.GameEntry{}, "name") {
		// Migration already done previously
		return
	}

	log.Println("Running legacy game_entries data migration to RobloxMap...")

	// We temporarily need to load name and roblox_link. Since the struct model doesn't have them anymore,
	// we can query them dynamically using raw SQL!
	type LegacyEntry struct {
		ID         uint
		Name       string
		RobloxLink string
	}

	var legacyEntries []LegacyEntry
	if err := db.Raw("SELECT id, name, roblox_link FROM game_entries").Scan(&legacyEntries).Error; err != nil {
		log.Println("Error reading legacy game_entries: ", err)
		return
	}

	for _, le := range legacyEntries {
		if le.Name == "" {
			continue
		}

		// Find or create RobloxMap
		var robloxMap models.RobloxMap
		if err := db.Where("name = ?", le.Name).First(&robloxMap).Error; err != nil {
			// Try to parse URL path from roblox_link
			urlPath := ""
			if strings.Contains(le.RobloxLink, "roblox.com") {
				parts := strings.Split(le.RobloxLink, "roblox.com")
				if len(parts) > 1 {
					urlPath = parts[1]
				}
			}

			robloxMap = models.RobloxMap{
				Name:      le.Name,
				UrlPath:   urlPath,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			if err := db.Create(&robloxMap).Error; err != nil {
				log.Printf("Error creating RobloxMap for legacy entry %d: %v", le.ID, err)
				continue
			}
		}

		// Update game_entry RobloxMapID
		if err := db.Exec("UPDATE game_entries SET roblox_map_id = ? WHERE id = ?", robloxMap.ID, le.ID).Error; err != nil {
			log.Printf("Error updating roblox_map_id on game_entry %d: %v", le.ID, err)
		}
	}

	// 2. Safely drop the legacy columns name and roblox_link
	log.Println("Dropping legacy columns 'name' and 'roblox_link' from game_entries...")
	if err := db.Migrator().DropColumn(&models.GameEntry{}, "name"); err != nil {
		log.Println("Warning: failed to drop column 'name':", err)
	}
	if err := db.Migrator().DropColumn(&models.GameEntry{}, "roblox_link"); err != nil {
		log.Println("Warning: failed to drop column 'roblox_link':", err)
	}

	log.Println("game_entries database normalization successfully completed!")
}
