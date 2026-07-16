package waf

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestShowBlockPageUsesVampireBrand(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, DecoyPath, nil)

	ShowBlockPage(context, errors.New("access denied"))

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %q, want HTML", contentType)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, "VAMPIRE WAF") {
		t.Fatalf("block page does not contain VAMPIRE WAF: %q", body)
	}
	if strings.Contains(body, "nezha WAF") || strings.Contains(body, "Server WAF") {
		t.Fatalf("block page still contains an upstream WAF brand: %q", body)
	}
}

func TestShowBlockPageDefaultMessageUsesVampireBrand(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, DecoyPath, nil)

	ShowBlockPage(context, nil)

	if !strings.Contains(recorder.Body.String(), "blocked by VAMPIRE WAF") {
		t.Fatalf("default block message does not use VAMPIRE WAF: %q", recorder.Body.String())
	}
}

func TestShowBlockPageEscapesErrorMessage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, DecoyPath, nil)

	ShowBlockPage(context, errors.New(`<script>alert("xss")</script>`))

	body := recorder.Body.String()
	if strings.Contains(body, "<script>") {
		t.Fatalf("WAF page rendered an unescaped error message: %q", body)
	}
	if !strings.Contains(body, "&lt;script&gt;") {
		t.Fatalf("WAF page did not preserve the escaped error message: %q", body)
	}
}
