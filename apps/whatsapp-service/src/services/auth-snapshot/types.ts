export interface SnapshotMetadata {
  checksum: string; // SHA256 of compressed file
  sizeBytes: number;
  createdAt: string; // ISO 8601
  encryptionIv: string; // hex
  encryptionAuthTag: string; // hex
}

export interface SnapshotData {
  metadata: SnapshotMetadata;
  data: string; // base64 of encrypted file
}
