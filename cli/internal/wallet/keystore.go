package wallet

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/scrypt"

	"github.com/allbridge-io/rest-api/cli/internal/config"
)

type Family string

const (
	FamilyEVM      Family = "EVM"
	FamilySolana   Family = "SOLANA"
	FamilyTron     Family = "TRX"
	FamilySoroban  Family = "SRB"
	FamilyStellar  Family = "STLR"
	FamilyAlgorand Family = "ALG"
	FamilySui      Family = "SUI"
	FamilyStacks   Family = "STX"
)

func ParseFamily(v string) (Family, error) {
	switch Family(strings.ToUpper(strings.TrimSpace(v))) {
	case FamilyEVM:
		return FamilyEVM, nil
	case "SOL":
		return FamilySolana, nil
	case FamilySolana:
		return FamilySolana, nil
	case "TRON":
		return FamilyTron, nil
	case FamilyTron:
		return FamilyTron, nil
	case "SOROBAN":
		return FamilySoroban, nil
	case FamilySoroban:
		return FamilySoroban, nil
	case "STELLAR":
		return FamilyStellar, nil
	case FamilyStellar:
		return FamilyStellar, nil
	case "ALGO", "ALGORAND":
		return FamilyAlgorand, nil
	case FamilyAlgorand:
		return FamilyAlgorand, nil
	case FamilySui:
		return FamilySui, nil
	case "STACKS":
		return FamilyStacks, nil
	case FamilyStacks:
		return FamilyStacks, nil
	}
	return "", fmt.Errorf("wallet: unknown family %q", v)
}

func (f Family) IsKnown() bool {
	switch f {
	case FamilyEVM, FamilySolana, FamilyTron, FamilySoroban, FamilyStellar, FamilyAlgorand, FamilySui, FamilyStacks:
		return true
	}
	return false
}

const fileName = "keystore.json"

type Entry struct {
	Name       string    `json:"name"`
	Family     Family    `json:"family"`
	Address    string    `json:"address"`
	KDF        string    `json:"kdf"`
	KDFParams  KDFParams `json:"kdfParams"`
	Cipher     string    `json:"cipher"`
	Ciphertext string    `json:"ciphertext"`
	Nonce      string    `json:"nonce"`
	CreatedAt  time.Time `json:"createdAt"`
}

type KDFParams struct {
	N    int    `json:"n"`
	R    int    `json:"r"`
	P    int    `json:"p"`
	Salt string `json:"salt"` // base64
}

type Store struct {
	Version int              `json:"version"`
	Default string           `json:"default,omitempty"`
	Entries map[string]Entry `json:"entries"`

	path string
	mu   sync.Mutex
}

func Load() (*Store, error) {
	dir, err := config.Dir()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dir, fileName)
	st := &Store{Version: 1, Entries: map[string]Entry{}, path: path}
	buf, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return st, nil
	}
	if err != nil {
		return nil, fmt.Errorf("wallet: read keystore: %w", err)
	}
	if err := json.Unmarshal(buf, st); err != nil {
		return nil, fmt.Errorf("wallet: parse keystore: %w", err)
	}
	if st.Entries == nil {
		st.Entries = map[string]Entry{}
	}
	st.path = path
	return st, nil
}

func (s *Store) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return fmt.Errorf("wallet: mkdir: %w", err)
	}
	buf, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, buf, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *Store) Path() string { return s.path }

func (s *Store) Names() []string {
	out := make([]string, 0, len(s.Entries))
	for n := range s.Entries {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

func (s *Store) Get(name string) (Entry, error) {
	if name == "" {
		name = s.Default
	}
	if name == "" {
		return Entry{}, errors.New("wallet: no default wallet set; use --wallet or `allbridge wallet set-default`")
	}
	e, ok := s.Entries[name]
	if !ok {
		return Entry{}, fmt.Errorf("wallet: entry %q not found", name)
	}
	return e, nil
}

func (s *Store) Add(name string, family Family, address string, secret []byte, passphrase string) error {
	if !family.IsKnown() {
		return fmt.Errorf("wallet: unknown family %q", family)
	}
	if _, exists := s.Entries[name]; exists {
		return fmt.Errorf("wallet: entry %q already exists", name)
	}
	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}
	const N, R, P = 1 << 15, 8, 1 // ~ 32 MiB, ~150 ms on a modern CPU
	key, err := scrypt.Key([]byte(passphrase), salt, N, R, P, 32)
	if err != nil {
		return err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}
	ct := gcm.Seal(nil, nonce, secret, []byte(name))

	s.mu.Lock()
	s.Entries[name] = Entry{
		Name:    name,
		Family:  family,
		Address: address,
		KDF:     "scrypt",
		KDFParams: KDFParams{
			N: N, R: R, P: P,
			Salt: base64.StdEncoding.EncodeToString(salt),
		},
		Cipher:     "aes-gcm",
		Ciphertext: base64.StdEncoding.EncodeToString(ct),
		Nonce:      base64.StdEncoding.EncodeToString(nonce),
		CreatedAt:  time.Now().UTC(),
	}
	if s.Default == "" {
		s.Default = name
	}
	s.mu.Unlock()
	return nil
}

func Decrypt(e Entry, passphrase string) ([]byte, error) {
	salt, err := base64.StdEncoding.DecodeString(e.KDFParams.Salt)
	if err != nil {
		return nil, fmt.Errorf("wallet: salt: %w", err)
	}
	ct, err := base64.StdEncoding.DecodeString(e.Ciphertext)
	if err != nil {
		return nil, fmt.Errorf("wallet: ciphertext: %w", err)
	}
	nonce, err := base64.StdEncoding.DecodeString(e.Nonce)
	if err != nil {
		return nil, fmt.Errorf("wallet: nonce: %w", err)
	}
	key, err := scrypt.Key([]byte(passphrase), salt, e.KDFParams.N, e.KDFParams.R, e.KDFParams.P, 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	pt, err := gcm.Open(nil, nonce, ct, []byte(e.Name))
	if err != nil {
		return nil, fmt.Errorf("wallet: decrypt failed (wrong passphrase?): %w", err)
	}
	return pt, nil
}

func (s *Store) Remove(name string) error {
	if _, ok := s.Entries[name]; !ok {
		return fmt.Errorf("wallet: entry %q not found", name)
	}
	delete(s.Entries, name)
	if s.Default == name {
		s.Default = ""
		for n := range s.Entries {
			s.Default = n
			break
		}
	}
	return nil
}

func (s *Store) SetDefault(name string) error {
	if _, ok := s.Entries[name]; !ok {
		return fmt.Errorf("wallet: entry %q not found", name)
	}
	s.Default = name
	return nil
}
