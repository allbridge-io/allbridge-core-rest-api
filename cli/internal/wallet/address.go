package wallet

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	solanago "github.com/gagliardetto/solana-go"
	"github.com/mr-tron/base58"
)

const TronMainnetPrefix = 0x41

func SecretToAddress(family Family, secret []byte) (string, error) {
	switch family {
	case FamilyEVM:
		k, err := crypto.ToECDSA(secret)
		if err != nil {
			h := strings.TrimPrefix(strings.TrimSpace(string(secret)), "0x")
			b, decErr := hex.DecodeString(h)
			if decErr == nil {
				k, err = crypto.ToECDSA(b)
			}
			if err != nil {
				return "", fmt.Errorf("wallet/EVM: invalid private key: %w", err)
			}
		}
		return crypto.PubkeyToAddress(k.PublicKey).Hex(), nil
	case FamilySolana:
		k := solanago.PrivateKey(secret)
		if err := k.Validate(); err != nil {
			return "", fmt.Errorf("wallet/SOLANA: invalid private key: %w", err)
		}
		return k.PublicKey().String(), nil
	case FamilyTron:
		k, err := crypto.ToECDSA(secret)
		if err != nil {
			return "", fmt.Errorf("wallet/TRX: invalid private key: %w", err)
		}
		evmAddr := crypto.PubkeyToAddress(k.PublicKey)
		raw := make([]byte, 21)
		raw[0] = TronMainnetPrefix
		copy(raw[1:], evmAddr.Bytes())
		return tronBase58Check(raw), nil
	}
	return "", fmt.Errorf("wallet: address derivation not implemented for family %q", family)
}

func tronBase58Check(data []byte) string {
	first := sha256.Sum256(data)
	second := sha256.Sum256(first[:])
	out := make([]byte, 0, len(data)+4)
	out = append(out, data...)
	out = append(out, second[:4]...)
	return base58.Encode(out)
}

func DecodeTronAddress(addr string) ([]byte, error) {
	raw, err := base58.Decode(addr)
	if err != nil {
		return nil, fmt.Errorf("wallet/TRX: bad base58 address: %w", err)
	}
	if len(raw) != 25 {
		return nil, fmt.Errorf("wallet/TRX: address length %d, want 25", len(raw))
	}
	body, sum := raw[:21], raw[21:]
	first := sha256.Sum256(body)
	second := sha256.Sum256(first[:])
	for i := 0; i < 4; i++ {
		if sum[i] != second[i] {
			return nil, errors.New("wallet/TRX: address checksum mismatch")
		}
	}
	return body, nil
}

func MustEVMAddress(addr string) common.Address {
	if !common.IsHexAddress(addr) {
		panic(errors.New("not a hex address: " + addr))
	}
	return common.HexToAddress(addr)
}

func GenerateEVM() ([]byte, string, error) {
	k, err := crypto.GenerateKey()
	if err != nil {
		return nil, "", fmt.Errorf("wallet/EVM: generate key: %w", err)
	}
	secret := crypto.FromECDSA(k)
	addr := crypto.PubkeyToAddress(k.PublicKey).Hex()
	return secret, addr, nil
}

func Generate(family Family) ([]byte, string, error) {
	switch family {
	case FamilyEVM:
		return GenerateEVM()
	case FamilyTron:
		secret, _, err := GenerateEVM()
		if err != nil {
			return nil, "", err
		}
		addr, err := SecretToAddress(FamilyTron, secret)
		if err != nil {
			return nil, "", err
		}
		return secret, addr, nil
	case FamilySolana:
		k, err := solanago.NewRandomPrivateKey()
		if err != nil {
			return nil, "", fmt.Errorf("wallet/SOLANA: generate key: %w", err)
		}
		return []byte(k), k.PublicKey().String(), nil
	}
	return nil, "", fmt.Errorf("wallet: on-device generation not supported for family %q (use `wallet import` instead)", family)
}
