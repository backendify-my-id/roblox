package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/gofiber/fiber/v2"
)

func generateInviteCode() string {
	bytes := make([]byte, 4) // 8 hex characters
	if _, err := rand.Read(bytes); err != nil {
		return "ERROR123" // Fallback, shouldn't happen
	}
	return hex.EncodeToString(bytes)
}

func generateShareToken() string {
	bytes := make([]byte, 16) // 32 hex characters
	if _, err := rand.Read(bytes); err != nil {
		return "fallback_token_" + generateInviteCode()
	}
	return hex.EncodeToString(bytes)
}

func GetGameLists(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	var lists []models.GameList
	// Find all game lists where this user is a member
	if err := database.DB.
		Joins("JOIN game_list_members on game_list_members.game_list_id = game_lists.id").
		Where("game_list_members.user_id = ?", userID).
		Preload("Owner").
		Preload("Members.User").
		Preload("Entries").
		Find(&lists).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch game lists"})
	}

	return c.JSON(lists)
}

func CreateGameList(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	if input.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name is required"})
	}

	inviteCode := generateInviteCode()
	shareToken := generateShareToken()

	list := models.GameList{
		Name:        input.Name,
		Description: input.Description,
		InviteCode:  inviteCode,
		ShareToken:  shareToken,
		OwnerID:     userID,
	}

	if err := database.DB.Create(&list).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create game list"})
	}

	// Add owner as a member
	member := models.GameListMember{
		GameListID: list.ID,
		UserID:     userID,
	}
	database.DB.Create(&member)

	return c.Status(fiber.StatusCreated).JSON(list)
}

func GetGameListDetail(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")

	// Check if user is a member
	var member models.GameListMember
	if err := database.DB.Where("game_list_id = ? AND user_id = ?", listID, userID).First(&member).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are not a member of this list"})
	}

	var list models.GameList
	if err := database.DB.
		Preload("Owner").
		Preload("Members.User").
		Preload("Entries").
		Preload("Entries.AddedBy").
		Preload("Entries.Media").
		Preload("Entries.RobloxMap").
		First(&list, listID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "List not found"})
	}

	return c.JSON(list)
}

func UpdateGameList(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")

	var list models.GameList
	if err := database.DB.First(&list, listID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "List not found"})
	}

	if list.OwnerID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only the owner can update the list"})
	}

	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	if input.Name != "" {
		list.Name = input.Name
	}
	list.Description = input.Description

	if err := database.DB.Save(&list).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update list"})
	}

	return c.JSON(list)
}

func DeleteGameList(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")

	var list models.GameList
	if err := database.DB.First(&list, listID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "List not found"})
	}

	if list.OwnerID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only the owner can delete the list"})
	}

	// Delete members, entries, media first (cascading conceptually, though GORM could do it if configured)
	database.DB.Where("game_list_id = ?", listID).Delete(&models.GameListMember{})
	// For entries, we'd ideally delete media too. A simple way is to delete entries; we'll add cascade later if needed.
	database.DB.Where("game_list_id = ?", listID).Delete(&models.GameEntry{})
	
	if err := database.DB.Delete(&list).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete list"})
	}

	return c.JSON(fiber.Map{"message": "List deleted successfully"})
}

func JoinGameList(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	var input struct {
		InviteCode string `json:"invite_code"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	if input.InviteCode == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invite code is required"})
	}

	var list models.GameList
	// Database query menggunakan Lowercase karena hex.EncodeToString menghasilkan lowercase hex digits, 
	// sedangkan user di Frontend mengetik dengan huruf kapital (Uppercase).
	if err := database.DB.Where("LOWER(invite_code) = LOWER(?)", input.InviteCode).First(&list).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Invalid invite code or list not found"})
	}

	// Check if already a member
	var member models.GameListMember
	if err := database.DB.Where("game_list_id = ? AND user_id = ?", list.ID, userID).First(&member).Error; err == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "You are already a member of this list"})
	}

	newMember := models.GameListMember{
		GameListID: list.ID,
		UserID:     userID,
	}
	if err := database.DB.Create(&newMember).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to join list"})
	}

	return c.JSON(fiber.Map{"message": "Successfully joined the list", "list_id": list.ID})
}

func LeaveGameList(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")

	var list models.GameList
	if err := database.DB.First(&list, listID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "List not found"})
	}

	if list.OwnerID == userID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Owner cannot leave the list, delete it instead"})
	}

	if err := database.DB.Where("game_list_id = ? AND user_id = ?", listID, userID).Delete(&models.GameListMember{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to leave list"})
	}

	return c.JSON(fiber.Map{"message": "Successfully left the list"})
}

func RegenerateInviteCode(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	listID := c.Params("id")

	var list models.GameList
	if err := database.DB.First(&list, listID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "List not found"})
	}

	if list.OwnerID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only the owner can regenerate the invite code"})
	}

	list.InviteCode = generateInviteCode()
	if err := database.DB.Save(&list).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to regenerate invite code"})
	}

	return c.JSON(fiber.Map{"message": "Invite code regenerated", "invite_code": list.InviteCode})
}

func GetPublicGameList(c *fiber.Ctx) error {
	shareToken := c.Params("shareToken")

	var list models.GameList
	if err := database.DB.
		Preload("Owner").
		Preload("Members.User").
		Preload("Entries").
		Preload("Entries.AddedBy").
		Preload("Entries.Media").
		Preload("Entries.RobloxMap").
		Preload("Entries.Reviews").
		Preload("Entries.Reviews.User").
		Where("share_token = ?", shareToken).
		First(&list).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "List not found or sharing has been disabled"})
	}

	return c.JSON(list)
}

func ImportGameList(c *fiber.Ctx) error {
	userID, err := getUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	shareToken := c.Params("shareToken")

	// 1. Fetch original shared list with its entries
	var originalList models.GameList
	if err := database.DB.
		Preload("Entries").
		Where("share_token = ?", shareToken).
		First(&originalList).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Daftar game tidak ditemukan"})
	}

	// 2. Create cloned list
	clonedList := models.GameList{
		Name:        originalList.Name,
		Description: originalList.Description,
		OwnerID:     userID,
		InviteCode:  generateInviteCode(),
		ShareToken:  generateShareToken(),
	}

	if err := database.DB.Create(&clonedList).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Gagal mengimpor daftar game"})
	}

	// 3. Add current user as member of the cloned list
	member := models.GameListMember{
		GameListID: clonedList.ID,
		UserID:     userID,
	}
	database.DB.Create(&member)

	// 4. Clone all entries
	for _, entry := range originalList.Entries {
		clonedEntry := models.GameEntry{
			GameListID:  clonedList.ID,
			AddedByID:   userID,
			RobloxMapID: entry.RobloxMapID,
			Description: entry.Description,
			Status:      "to_play", // Reset to fresh status
		}
		database.DB.Create(&clonedEntry)
	}

	return c.Status(fiber.StatusCreated).JSON(clonedList)
}
