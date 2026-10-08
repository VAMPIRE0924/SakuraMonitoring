package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/nezhahq/nezha/model"
	"github.com/nezhahq/nezha/service/singleton"
	"github.com/stretchr/testify/require"
)

func TestListConfigPreservesCustomAppearance(t *testing.T) {
	original := singleton.Conf
	t.Cleanup(func() { singleton.Conf = original })
	const dashboardCode = "<style>/* dashboard and login appearance */</style>"
	const frontendCode = "<style>/* public frontend appearance */</style>"
	singleton.Conf = &singleton.ConfigClass{Config: &model.Config{
		ConfigForGuests: model.ConfigForGuests{
			SiteName: "Sakura visibility test", CustomCode: frontendCode,
			CustomCodeDashboard: dashboardCode,
		},
		ConfigDashboard: model.ConfigDashboard{InstallHost: "agent.example.invalid", AgentTLS: true},
	}}
	for _, tc := range []struct {
		name string
		user *model.User
	}{
		{name: "anonymous"},
		{name: "member", user: &model.User{Role: model.RoleMember}},
		{name: "admin", user: &model.User{Role: model.RoleAdmin}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/setting", nil)
			if tc.user != nil {
				c.Set(model.CtxKeyAuthorizedUser, tc.user)
			}
			commonHandler(listConfig)(c)
			require.Equal(t, http.StatusOK, w.Code)
			var body struct {
				Success bool `json:"success"`
				Data    struct {
					Config map[string]any `json:"config"`
				} `json:"data"`
			}
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
			require.True(t, body.Success)
			require.Equal(t, frontendCode, body.Data.Config["custom_code"])
			// Login and member pages need the same appearance code as admin pages.
			require.Equal(t, dashboardCode, body.Data.Config["custom_code_dashboard"])
			if tc.user != nil {
				require.Equal(t, "agent.example.invalid", body.Data.Config["install_host"])
			} else {
				require.NotContains(t, body.Data.Config, "install_host")
			}
			require.Equal(t, dashboardCode, singleton.Conf.CustomCodeDashboard)
		})
	}
}
