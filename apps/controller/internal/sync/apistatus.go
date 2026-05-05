package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// PatchAgentStatus notifies the Kivo API to update the agent's k8sStatus in postgres.
// Called by the reconciler after every successful status change.
// The API's /internal route is protected by NetworkPolicy — only reachable from within the cluster.
func PatchAgentStatus(ctx context.Context, apiBaseURL, agentID, phase string) error {
	url := strings.TrimRight(apiBaseURL, "/") + "/internal/agents/" + agentID + "/k8s-status"

	body, err := json.Marshal(map[string]string{"phase": phase})
	if err != nil {
		return fmt.Errorf("marshal phase body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("PATCH %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status %d from %s", resp.StatusCode, url)
	}

	return nil
}
