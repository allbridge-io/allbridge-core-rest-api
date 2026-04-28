package wallet

import (
	"bytes"
	"testing"

	solanago "github.com/gagliardetto/solana-go"
)

func TestStoreAddGetDecrypt(t *testing.T) {
	secret := []byte("01234567890123456789012345678901")
	store := &Store{
		Version: 1,
		Entries: map[string]Entry{},
	}

	if err := store.Add("main", FamilyEVM, "0xabc", secret, "passphrase"); err != nil {
		t.Fatalf("Add returned error: %v", err)
	}
	if store.Default != "main" {
		t.Fatalf("Default = %q, want main", store.Default)
	}

	entry, err := store.Get("")
	if err != nil {
		t.Fatalf("Get default returned error: %v", err)
	}
	if entry.Name != "main" {
		t.Fatalf("entry name = %q, want main", entry.Name)
	}
	if entry.Ciphertext == "" || entry.Nonce == "" || entry.KDFParams.Salt == "" {
		t.Fatal("encrypted entry is missing ciphertext, nonce or salt")
	}

	got, err := Decrypt(entry, "passphrase")
	if err != nil {
		t.Fatalf("Decrypt returned error: %v", err)
	}
	if !bytes.Equal(got, secret) {
		t.Fatalf("decrypted secret mismatch")
	}
	if _, err := Decrypt(entry, "wrong-passphrase"); err == nil {
		t.Fatal("Decrypt with wrong passphrase returned nil error")
	}
}

func TestStoreAddRejectsDuplicate(t *testing.T) {
	store := &Store{
		Version: 1,
		Entries: map[string]Entry{},
	}
	if err := store.Add("main", FamilyEVM, "0xabc", []byte("secret"), "passphrase"); err != nil {
		t.Fatalf("Add returned error: %v", err)
	}
	if err := store.Add("main", FamilyEVM, "0xabc", []byte("secret"), "passphrase"); err == nil {
		t.Fatal("duplicate Add returned nil error")
	}
}

func TestParseFamilyCanonicalizesAliases(t *testing.T) {
	tests := map[string]Family{
		"evm":      FamilyEVM,
		"SOL":      FamilySolana,
		"solana":   FamilySolana,
		"tron":     FamilyTron,
		"soroban":  FamilySoroban,
		"srb":      FamilySoroban,
		"stellar":  FamilyStellar,
		"stlr":     FamilyStellar,
		"algo":     FamilyAlgorand,
		"algorand": FamilyAlgorand,
		"alg":      FamilyAlgorand,
		"sui":      FamilySui,
		"stacks":   FamilyStacks,
		"stx":      FamilyStacks,
	}

	for input, want := range tests {
		got, err := ParseFamily(input)
		if err != nil {
			t.Fatalf("ParseFamily(%q) error: %v", input, err)
		}
		if got != want {
			t.Fatalf("ParseFamily(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSecretToAddressSolana(t *testing.T) {
	priv, err := solanago.NewRandomPrivateKey()
	if err != nil {
		t.Fatalf("NewRandomPrivateKey returned error: %v", err)
	}
	got, err := SecretToAddress(FamilySolana, priv)
	if err != nil {
		t.Fatalf("SecretToAddress returned error: %v", err)
	}
	if got != priv.PublicKey().String() {
		t.Fatalf("SecretToAddress = %q, want %q", got, priv.PublicKey().String())
	}
}
