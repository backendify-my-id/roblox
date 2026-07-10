package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/apany/roblox-friend-tracker/utils"
)

type DiscordEmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type DiscordEmbed struct {
	Title       string             `json:"title,omitempty"`
	Description string             `json:"description,omitempty"`
	Color       int                `json:"color,omitempty"`
	Fields      []DiscordEmbedField `json:"fields,omitempty"`
	Thumbnail   map[string]string  `json:"thumbnail,omitempty"`
	Timestamp   string             `json:"timestamp,omitempty"`
	Footer      map[string]string  `json:"footer,omitempty"`
}

type DiscordWebhookPayload struct {
	Username  string         `json:"username,omitempty"`
	AvatarURL string         `json:"avatar_url,omitempty"`
	Content   string         `json:"content,omitempty"`
	Embeds    []DiscordEmbed `json:"embeds,omitempty"`
}

// SendDiscordWebhook sends a webhook payload to the configured Discord webhook URL if enabled.
func SendDiscordWebhook(payload DiscordWebhookPayload) {
	webhookURL := GetSystemSettingString("discord_webhook_url", "")
	if webhookURL == "" {
		return
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		utils.LogCron("ERROR", "[DiscordWebhook] Failed to marshal payload: %v", err)
		return
	}

	go func() {
		resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(payloadBytes))
		if err != nil {
			utils.LogCron("ERROR", "[DiscordWebhook] HTTP request failed: %v", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			utils.LogCron("ERROR", "[DiscordWebhook] Discord returned status code: %d", resp.StatusCode)
		}
	}()
}

// NotifyPresenceChange sends a webhook message when a user's presence state changes.
func NotifyPresenceChange(username string, oldPresence, oldGame, newPresence, newGame string, isStealth bool) {
	// Respect selective settings
	if GetSystemSettingBool("discord_notify_shadow_only", false) {
		return
	}
	if !GetSystemSettingBool("discord_notify_online_offline", true) {
		return
	}

	// Determine if game changed instead of just presence
	isGameChanged := oldPresence == newPresence && oldGame != newGame && newPresence == "In-Game"
	if isGameChanged && !GetSystemSettingBool("discord_notify_game_changed", true) {
		return
	}

	// Set colors
	color := 10070709 // Default Gray (Offline)
	statusText := newPresence
	if newPresence == "Online" {
		color = 3066993 // Green
	} else if newPresence == "In-Game" {
		color = 10181046 // Purple
		statusText = fmt.Sprintf("🎮 Playing: %s", newGame)
	} else if newPresence == "In-Studio" {
		color = 15105570 // Orange/Yellow
		statusText = fmt.Sprintf("🔧 In-Studio: %s", newGame)
	}

	stealthSuffix := ""
	if isStealth {
		stealthSuffix = " 🕵️ *(Stealth Mode Exempt)*"
	}

	title := fmt.Sprintf("🟢 %s is now Online", username)
	if newPresence == "Offline" {
		title = fmt.Sprintf("⚫ %s is now Offline", username)
	} else if newPresence == "In-Game" {
		title = fmt.Sprintf("🎮 %s is now In-Game", username)
	} else if newPresence == "In-Studio" {
		title = fmt.Sprintf("🔧 %s is now In-Studio", username)
	}

	fields := []DiscordEmbedField{
		{Name: "User", Value: username, Inline: true},
		{Name: "Status", Value: statusText + stealthSuffix, Inline: true},
	}
	if oldPresence != "" {
		oldStatus := oldPresence
		if oldPresence == "In-Game" || oldPresence == "In-Studio" {
			oldStatus = fmt.Sprintf("%s (%s)", oldPresence, oldGame)
		}
		fields = append(fields, DiscordEmbedField{Name: "Previous Status", Value: oldStatus, Inline: false})
	}

	SendDiscordWebhook(DiscordWebhookPayload{
		Username: "Roblox Friend Tracker",
		Embeds: []DiscordEmbed{
			{
				Title:     title,
				Color:     color,
				Fields:    fields,
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Footer: map[string]string{
					"text": "Presence Live Tracking",
				},
			},
		},
	})
}

// NotifyShadowActivity sends a warning when a user edits their avatar while pretending to be offline.
func NotifyShadowActivity(username string, durationMinutes int, oldAvatar, newAvatar string) {
	SendDiscordWebhook(DiscordWebhookPayload{
		Username: "Roblox Friend Tracker - Security Audit",
		Embeds: []DiscordEmbed{
			{
				Title:       "🚨 Deteksi Siluman (Stealth Activity Detected)",
				Description: fmt.Sprintf("Pengguna **%s** terdeteksi melakukan perubahan avatar Roblox meskipun berstatus **Offline** selama lebih dari %d menit!", username, durationMinutes),
				Color:       15548997, // Soft Red
				Fields: []DiscordEmbedField{
					{Name: "Username", Value: username, Inline: true},
					{Name: "Durasi Offline", Value: fmt.Sprintf("%d menit", durationMinutes), Inline: true},
				},
				Thumbnail: map[string]string{
					"url": newAvatar,
				},
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Footer: map[string]string{
					"text": "Stealth Mode Detection Alert",
				},
			},
		},
	})
}

// NotifyAdminAction sends a log of administrative actions to Discord.
func NotifyAdminAction(adminUsername string, action string, detail string) {
	if !GetSystemSettingBool("discord_notify_admin_actions", true) {
		return
	}

	SendDiscordWebhook(DiscordWebhookPayload{
		Username: "Roblox Friend Tracker - System Log",
		Embeds: []DiscordEmbed{
			{
				Title:       "🛡️ Tindakan Administratif (Admin Action)",
				Description: fmt.Sprintf("Admin **%s** melakukan tindakan: **%s**", adminUsername, action),
				Color:       3447003, // Blue
				Fields: []DiscordEmbedField{
					{Name: "Detail", Value: detail, Inline: false},
				},
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Footer: map[string]string{
					"text": "System Security Logs",
				},
			},
		},
	})
}
