import "server-only";
import { BACKUP_PREFIX, latestBackup, listPrivateFiles } from "./backups";

export async function storageUsage() {
  const files = await listPrivateFiles();
  const backup = await latestBackup(files);
  const budget = Number(process.env.MUSEUM_STORAGE_BUDGET_BYTES);
  const capacityBytes =
    Number.isSafeInteger(budget) && budget > 0 ? budget : null;
  const usedBytes = files.reduce((sum, file) => sum + file.size, 0);
  const backupBytes = files
    .filter((file) => file.pathname.startsWith(BACKUP_PREFIX))
    .reduce((sum, file) => sum + file.size, 0);
  const imageBytes = files
    .filter(
      (file) =>
        file.pathname.startsWith("museum/media/") ||
        file.pathname.startsWith("museum/sources/"),
    )
    .reduce((sum, file) => sum + file.size, 0);
  return {
    available: true as const,
    usedBytes,
    backupBytes,
    imageBytes,
    fileCount: files.length,
    capacityBytes,
    remainingBytes:
      capacityBytes === null ? null : Math.max(0, capacityBytes - usedBytes),
    checkedAt: new Date().toISOString(),
    lastBackup: backup
      ? { createdAt: backup.createdAt, assets: backup.assets.length }
      : null,
    dailyBackupEnabled: Boolean(process.env.CRON_SECRET),
  };
}
export type StorageUsage = Awaited<ReturnType<typeof storageUsage>>;
