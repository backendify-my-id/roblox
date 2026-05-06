package database

import (
	"fmt"
	"log"
	"os"

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

	// log.Println("Dropping old tables to apply breaking schema changes...")
	// DB.Migrator().DropTable(&models.ActivityLog{}, &models.ProfileChangeLog{}, &models.Friend{}, &models.User{})

	err = DB.AutoMigrate(
		&models.Role{},
		&models.User{},
		&models.Friend{},
		&models.ActivityLog{},
		&models.ProfileChangeLog{},
	)
	if err != nil {
		log.Fatal("Failed to auto migrate database schemas: ", err)
	}
	log.Println("Database schemas auto migrated")

	seedRoles(DB)
}

func seedRoles(db *gorm.DB) {
	roles := []string{"admin", "user"}
	for _, roleName := range roles {
		var role models.Role
		if err := db.Where("name = ?", roleName).First(&role).Error; err != nil {
			db.Create(&models.Role{Name: roleName})
			log.Printf("Seeded role: %s", roleName)
		}
	}
}
