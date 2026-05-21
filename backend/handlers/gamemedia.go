package handlers

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func GetGameMedia(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")
	entryID := c.Params("eid")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	var media []models.GameMedia
	if err := database.DB.Where("game_entry_id = ?", entryID).Preload("UploadedBy").Order("created_at desc").Find(&media).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch media"})
	}

	return c.JSON(media)
}

func UploadGameMedia(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")
	entryID := c.Params("eid")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	// Verify entry belongs to the list
	var entry models.GameEntry
	if err := database.DB.Where("id = ? AND game_list_id = ?", entryID, listID).First(&entry).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Game entry not found in this list"})
	}

	// Make sure uploads directory exists
	uploadDir := "./uploads"
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create upload directory"})
	}

	// Get file from form
	file, err := c.FormFile("media")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No file uploaded or file too large"})
	}

	// Get caption
	caption := c.FormValue("caption")

	// Determine file type
	fileType := "unknown"
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".gif" || ext == ".webp" {
		fileType = "image"
	} else if ext == ".mp4" || ext == ".webm" || ext == ".mov" {
		fileType = "video"
	} else {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unsupported file type. Allowed: images (png, jpg, gif, webp) and video (mp4, webm, mov)"})
	}

	// Generate unique filename
	fileName := fmt.Sprintf("%s_%s%s", time.Now().Format("20060102150405"), uuid.New().String()[:8], ext)
	filePath := filepath.Join(uploadDir, fileName)

	// Save file to disk
	if err := c.SaveFile(file, filePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}

	// Construct URL (assuming server is serving /uploads statically)
	fileURL := fmt.Sprintf("/uploads/%s", fileName)

	media := models.GameMedia{
		GameEntryID:  entry.ID,
		UploadedByID: userID,
		FileURL:      fileURL,
		FileType:     fileType,
		Caption:      caption,
	}

	if err := database.DB.Create(&media).Error; err != nil {
		// Clean up file if db fails
		os.Remove(filePath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save media record"})
	}

	// Preload UploadedBy for response
	database.DB.Preload("UploadedBy").First(&media, media.ID)

	return c.Status(fiber.StatusCreated).JSON(media)
}

func DeleteGameMedia(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")
	entryID := c.Params("eid")
	mediaID := c.Params("mid")

	if err := verifyListMembership(c, listID, userID); err != nil {
		return err
	}

	var media models.GameMedia
	if err := database.DB.Where("id = ? AND game_entry_id = ?", mediaID, entryID).First(&media).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Media not found"})
	}

	// Only uploader or list owner can delete media
	var list models.GameList
	database.DB.First(&list, listID)
	
	if media.UploadedByID != userID && list.OwnerID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You do not have permission to delete this media"})
	}

	// Remove file from disk
	if strings.HasPrefix(media.FileURL, "/uploads/") {
		fileName := strings.TrimPrefix(media.FileURL, "/uploads/")
		filePath := filepath.Join(".", "uploads", fileName)
		os.Remove(filePath) // Ignore error, file might already be gone
	}

	if err := database.DB.Delete(&media).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete media record"})
	}

	return c.JSON(fiber.Map{"message": "Media deleted successfully"})
}
