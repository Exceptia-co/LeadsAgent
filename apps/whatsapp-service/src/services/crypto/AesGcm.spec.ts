import { AesGcm } from './AesGcm';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

describe('AesGcm', () => {
  it('round_trips_a_buffer_with_the_same_key', () => {
    const plaintext = Buffer.from(JSON.stringify({ creds: 'signal-state' }), 'utf8');

    const { ciphertext, iv, authTag } = AesGcm.encrypt(plaintext, KEY);
    const decrypted = AesGcm.decrypt(ciphertext, iv, authTag, KEY);

    expect(decrypted.toString('utf8')).toBe(plaintext.toString('utf8'));
    expect(ciphertext.equals(plaintext)).toBe(false);
  });

  it('produces_a_different_iv_per_call', () => {
    const plaintext = Buffer.from('same input', 'utf8');

    const first = AesGcm.encrypt(plaintext, KEY);
    const second = AesGcm.encrypt(plaintext, KEY);

    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it('throws_when_decrypting_with_the_wrong_key', () => {
    const { ciphertext, iv, authTag } = AesGcm.encrypt(Buffer.from('x', 'utf8'), KEY);

    expect(() => AesGcm.decrypt(ciphertext, iv, authTag, OTHER_KEY)).toThrow();
  });

  it('throws_when_the_ciphertext_has_been_tampered_with', () => {
    const { ciphertext, iv, authTag } = AesGcm.encrypt(Buffer.from('tamper me', 'utf8'), KEY);
    ciphertext[0] ^= 0xff;

    expect(() => AesGcm.decrypt(ciphertext, iv, authTag, KEY)).toThrow();
  });

  it('rejects_a_key_that_is_not_64_hex_chars', () => {
    expect(() => AesGcm.encrypt(Buffer.from('x', 'utf8'), 'tooshort')).toThrow(/64-character hex/);
  });

  it('rejects_a_64_character_key_that_is_not_hex', () => {
    const nonHexKey = 'g'.repeat(64);

    expect(() => AesGcm.encrypt(Buffer.from('x', 'utf8'), nonHexKey)).toThrow(/64-character hex/);
  });
});
