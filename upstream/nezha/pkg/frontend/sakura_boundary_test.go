package frontend

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestBuiltinStoreRejectsInstalledAndRemoteThemes(t *testing.T) {
	root := t.TempDir()
	existing := filepath.Join(root, "frontend-user-previous")
	if err := os.MkdirAll(filepath.Join(existing, "dist"), 0750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(existing, "metadata.json"), []byte(`{"path":"frontend-user-previous","name":"Other","custom":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(existing, "dist", "index.html"), []byte("other"), 0600); err != nil {
		t.Fatal(err)
	}
	builtins := []Template{{Path: "admin-dist", Name: "OfficialAdmin", IsAdmin: true}, {Path: "user-dist", Name: "Official"}, {Path: "sakura-user-dist", Name: "Sakura"}}
	store, err := NewBuiltinStore(root, builtins)
	if err != nil {
		t.Fatal(err)
	}
	if got := store.Templates(); len(got) != 3 {
		t.Fatalf("unexpected templates: %+v", got)
	}
	for _, admin := range []bool{false, true} {
		if _, err := store.Install(context.Background(), "https://github.com/example/theme", "v1.0.0", admin); err == nil {
			t.Fatal("external install accepted")
		}
	}
	if _, err := os.Stat(filepath.Join(existing, "dist", "index.html")); err != nil {
		t.Fatal("existing files must be preserved", err)
	}
	if err := store.Remove("sakura-user-dist", false); err == nil {
		t.Fatal("embedded Sakura removal accepted")
	}
}
