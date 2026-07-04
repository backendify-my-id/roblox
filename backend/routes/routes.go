package routes

import (
	"github.com/apany/roblox-friend-tracker/handlers"
	"github.com/apany/roblox-friend-tracker/middleware"
	"github.com/gofiber/fiber/v2"
)

// Setup registers all API and WebSocket routes for the application
func Setup(app *fiber.App) {
	api := app.Group("/api")

	// Public Routes
	api.Post("/auth/register", handlers.Register)
	api.Post("/auth/login", handlers.Login)
	api.Post("/auth/logout", middleware.Protected(), handlers.Logout)
	api.Get("/public/lists/:shareToken", handlers.GetPublicGameList)
	api.Get("/config", handlers.GetPublicConfig)

	// WebSocket Route
	api.Get("/ws", handlers.UpgradeWebSocket, handlers.HandleWebSocket())

	// Protected Routes
	api.Use(middleware.Protected())

	// V3 Routes
	api.Get("/friends", handlers.GetFriends)
	api.Post("/friends/sync", handlers.ManualSync)
	api.Get("/friends/:friendId/logs", handlers.GetActivityLogs)
	api.Get("/friends/:friendId/profile-changes", handlers.GetProfileChangeLogs)
	api.Put("/friends/:friendId/note", handlers.UpdateFriendNote)
	api.Get("/user/settings", handlers.GetUserSettings)
	api.Put("/user/settings", handlers.UpdateUserSettings)
	api.Put("/user/roblox-cookie", handlers.UpdateRobloxCookie)
	api.Put("/user/change-password", handlers.ChangePassword)
	api.Post("/user/stealth-exemptions", handlers.AddStealthExemption)
	api.Delete("/user/stealth-exemptions/:id", handlers.RemoveStealthExemption)
	api.Get("/user/logs", handlers.GetMyActivityLogs)
	api.Get("/user/profile-changes", handlers.GetMyProfileChanges)
	api.Post("/telemetry/track", handlers.TrackFeatureUsage)
	api.Get("/telemetry/stats", handlers.GetTelemetryStats)

	// Game Lists API
	api.Get("/lists", handlers.GetGameLists)
	api.Post("/lists", handlers.CreateGameList)
	api.Post("/lists/join", handlers.JoinGameList) // Static route HARUS sebelum /:id
	api.Post("/lists/import/:shareToken", handlers.ImportGameList)
	api.Get("/lists/:id", handlers.GetGameListDetail)
	api.Put("/lists/:id", handlers.UpdateGameList)
	api.Delete("/lists/:id", handlers.DeleteGameList)
	api.Delete("/lists/:id/leave", handlers.LeaveGameList)
	api.Post("/lists/:id/invite", handlers.RegenerateInviteCode)

	// Game Entries API
	api.Get("/lists/:id/entries", handlers.GetGameEntries)
	api.Post("/lists/:id/entries", handlers.CreateGameEntry)
	api.Put("/lists/:id/entries/:eid", handlers.UpdateGameEntry)
	api.Delete("/lists/:id/entries/:eid", handlers.DeleteGameEntry)
	api.Patch("/lists/:id/entries/:eid/status", handlers.ToggleGameEntryStatus)

	// Roblox Maps API
	api.Get("/maps", handlers.GetRobloxMaps)
	api.Get("/maps/search-roblox", handlers.SearchRobloxGamesOnline)
	api.Post("/maps", handlers.CreateRobloxMap)
	api.Delete("/maps/:id", middleware.RequirePermission("manage_user_permissions"), handlers.DeleteRobloxMap)
	api.Post("/maps/sync-names", middleware.RequirePermission("manage_user_permissions"), handlers.SyncRobloxMapNames)

	// Game Media API
	api.Get("/lists/:id/entries/:eid/media", handlers.GetGameMedia)
	api.Post("/lists/:id/entries/:eid/media", handlers.UploadGameMedia)
	api.Delete("/lists/:id/entries/:eid/media/:mid", handlers.DeleteGameMedia)

	// Game Reviews API
	api.Get("/lists/:id/entries/:eid/reviews", handlers.GetGameReviews)
	api.Post("/lists/:id/entries/:eid/reviews", handlers.SubmitGameReview)

	// Admin Routes (RBAC Protected)
	api.Get("/admin/users", middleware.RequirePermission("view_users_list"), handlers.GetAllUsers)
	api.Get("/admin/network-graph", middleware.RequirePermission("view_users_list"), handlers.GetFriendsNetworkGraph)
	api.Get("/admin/stats", middleware.RequirePermission("view_users_list"), handlers.GetAdminStats)
	api.Get("/admin/cron-status", middleware.RequirePermission("view_users_list"), handlers.GetCronStatus)
	api.Put("/admin/users/:id/approve", middleware.RequirePermission("manage_user_permissions"), handlers.ApproveUser)
	api.Delete("/admin/users/:id", middleware.RequirePermission("manage_user_permissions"), handlers.DeleteUser)
	api.Get("/admin/playing-together", middleware.RequirePermission("view_playing_together"), handlers.GetPlayingTogether)
	api.Get("/admin/playing-together/search", middleware.RequirePermission("view_playing_together"), handlers.SearchHistoricalCoPlayers)
	api.Get("/admin/shadow-activities", middleware.RequirePermission("view_shadow_activities"), handlers.GetShadowActivities)
	api.Put("/admin/shadow-activities/:id", middleware.RequirePermission("review_shadow_activities"), handlers.ReviewShadowActivity)
	api.Get("/admin/users/:id/logs", middleware.RequirePermission("view_users_list"), handlers.GetUserActivityLogs)
	api.Get("/admin/users/:id/game-history", middleware.RequirePermission("view_users_list"), handlers.GetUserGameHistory)
	api.Get("/admin/users/:id/profile-changes", middleware.RequirePermission("view_users_list"), handlers.GetUserProfileChanges)
	api.Get("/admin/users/:id/friends", middleware.RequirePermission("view_users_list"), handlers.GetUserFriends)
	api.Get("/admin/users/:id/tracked-by", middleware.RequirePermission("view_users_list"), handlers.GetUserTrackers)
	api.Put("/admin/users/:id/note", middleware.RequirePermission("view_users_list"), handlers.UpdateAdminNote)
	api.Put("/admin/users/:id/role", middleware.RequirePermission("manage_user_permissions"), handlers.UpdateUserRole)
	api.Get("/admin/logs/files", middleware.RequirePermission("view_users_list"), handlers.GetCronLogFiles)
	api.Get("/admin/logs/files/*", middleware.RequirePermission("view_users_list"), handlers.GetCronLogContent)
	api.Get("/admin/backup", middleware.RequirePermission("manage_user_permissions"), handlers.BackupDatabase)
	api.Post("/admin/restore", middleware.RequirePermission("manage_user_permissions"), handlers.RestoreDatabase)
	api.Get("/admin/settings", middleware.RequirePermission("manage_user_permissions"), handlers.GetSystemSettings)
	api.Put("/admin/settings", middleware.RequirePermission("manage_user_permissions"), handlers.UpdateSystemSettings)

	// Auto-backup archive management routes
	api.Get("/admin/backups/list", middleware.RequirePermission("view_users_list"), handlers.ListAutoBackups)
	api.Get("/admin/backups/download/:filename", middleware.RequirePermission("view_users_list"), handlers.DownloadAutoBackup)
	api.Post("/admin/backups/restore/:filename", middleware.RequirePermission("manage_user_permissions"), handlers.RestoreAutoBackup)
	api.Delete("/admin/backups/delete/:filename", middleware.RequirePermission("manage_user_permissions"), handlers.DeleteAutoBackup)
	api.Post("/admin/backups/trigger-auto", middleware.RequirePermission("manage_user_permissions"), handlers.TriggerAutoBackup)
}
