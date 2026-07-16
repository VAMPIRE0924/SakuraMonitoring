package main

import (
	"bytes"
	"fmt"
	"net"
	"os"

	maxminddb "github.com/oschwald/maxminddb-golang"
)

var metadataMarker = []byte("\xab\xcd\xefMaxMind.com")

func main() {
	if len(os.Args) < 3 {
		fatalf("usage: geoip-db-tool <validate DB | extract BINARY OUTPUT>")
	}

	switch os.Args[1] {
	case "validate":
		if len(os.Args) != 3 {
			fatalf("usage: geoip-db-tool validate DB")
		}
		data := readFile(os.Args[2])
		validate(data)
		fmt.Printf("GeoIP database valid: %s (%d bytes)\n", os.Args[2], len(data))
	case "extract":
		if len(os.Args) != 4 {
			fatalf("usage: geoip-db-tool extract BINARY OUTPUT")
		}
		data := extract(readFile(os.Args[2]))
		if err := os.WriteFile(os.Args[3], data, 0o600); err != nil {
			fatalf("write GeoIP database: %v", err)
		}
		fmt.Printf("Extracted GeoIP database: %s (%d bytes)\n", os.Args[3], len(data))
	default:
		fatalf("unknown command: %s", os.Args[1])
	}
}

func extract(binary []byte) []byte {
	probe, err := maxminddb.FromBytes(binary)
	if err != nil {
		fatalf("official binary does not contain a readable MaxMind database: %v", err)
	}

	marker := bytes.LastIndex(binary, metadataMarker)
	treeSize := int(probe.Metadata.NodeCount * probe.Metadata.RecordSize / 4)
	if marker < 0 || treeSize <= 0 {
		fatalf("official binary contains invalid MaxMind metadata")
	}

	zeros := make([]byte, 16)
	for separator := treeSize; separator+len(zeros) <= marker; separator++ {
		if !bytes.Equal(binary[separator:separator+len(zeros)], zeros) {
			continue
		}
		start := separator - treeSize
		minimumEnd := marker + len(metadataMarker) + 1
		maximumEnd := min(len(binary), minimumEnd+64*1024)
		for end := minimumEnd; end <= maximumEnd; end++ {
			candidate := binary[start:end]
			reader, err := maxminddb.FromBytes(candidate)
			if err != nil || reader.Metadata.NodeCount != probe.Metadata.NodeCount || reader.Metadata.RecordSize != probe.Metadata.RecordSize {
				continue
			}
			if err := reader.Verify(); err != nil {
				break
			}
			validate(candidate)
			return candidate
		}
	}

	fatalf("could not locate the embedded MaxMind database boundary")
	return nil
}

func validate(data []byte) {
	reader, err := maxminddb.FromBytes(data)
	if err != nil {
		fatalf("invalid MaxMind database: %v", err)
	}
	if err := reader.Verify(); err != nil {
		fatalf("MaxMind database verification failed: %v", err)
	}

	var record struct {
		Country   string `maxminddb:"country"`
		Continent string `maxminddb:"continent"`
	}
	if err := reader.Lookup(net.ParseIP("8.8.8.8"), &record); err != nil {
		fatalf("GeoIP lookup failed: %v", err)
	}
	if record.Country == "" && record.Continent == "" {
		fatalf("GeoIP database does not provide Nezha's country or continent fields")
	}
}

func readFile(path string) []byte {
	data, err := os.ReadFile(path)
	if err != nil {
		fatalf("read %s: %v", path, err)
	}
	return data
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
