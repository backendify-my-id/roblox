package utils

import "strings"

// ExtractRoblosecurity parses a full cookie string and returns the value of .ROBLOSECURITY.
// If the input doesn't contain ".ROBLOSECURITY=", it is assumed to be the raw token.
func ExtractRoblosecurity(cookieStr string) string {
	cookieStr = strings.TrimSpace(cookieStr)
	if !strings.Contains(cookieStr, ".ROBLOSECURITY=") {
		return cookieStr
	}

	parts := strings.Split(cookieStr, ";")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, ".ROBLOSECURITY=") {
			return strings.TrimPrefix(part, ".ROBLOSECURITY=")
		}
	}
	return cookieStr
}
