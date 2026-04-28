package render

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"sigs.k8s.io/yaml"
)

type Format string

const (
	FormatTable Format = "table"
	FormatJSON  Format = "json"
	FormatYAML  Format = "yaml"
	FormatWide  Format = "wide" // table with all columns
)

func ParseFormat(s string) (Format, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", "table":
		return FormatTable, nil
	case "wide":
		return FormatWide, nil
	case "json":
		return FormatJSON, nil
	case "yaml", "yml":
		return FormatYAML, nil
	}
	return "", fmt.Errorf("unknown output format %q (want table|wide|json|yaml)", s)
}

func JSON(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	return enc.Encode(v)
}

func YAML(w io.Writer, v any) error {
	buf, err := yaml.Marshal(v)
	if err != nil {
		return err
	}
	_, err = w.Write(buf)
	return err
}

func Auto(w io.Writer, f Format, v any) error {
	switch f {
	case FormatJSON:
		return JSON(w, v)
	case FormatYAML:
		return YAML(w, v)
	}
	return fmt.Errorf("render.Auto called for non-serial format %q", f)
}

func Out() io.Writer { return os.Stdout }
func Err() io.Writer { return os.Stderr }
