import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
// Front/Side/Back remain the three built-in defaults exactly as before.
// Custom categories (e.g. "chest", "arms") are persisted separately via
// database.getProgressPhotoCategories()/addProgressPhotoCategory() — this
// list is not hard-coded to only these three anywhere in the data model;
// a photo's `type` field can be any category key.
export const DEFAULT_PROGRESS_PHOTO_CATEGORIES = [
  { key: 'front', label: 'Front', custom: false },
  { key: 'side', label: 'Side', custom: false },
  { key: 'back', label: 'Back', custom: false },
];

// Filesystem-safe category key: lowercase, alphanumeric + hyphen only.
// Used both for validating custom category names and for building the
// predictable `fittrack/progress-photos/{category}-{date}.jpg` filename.
export function sanitizeCategoryKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// expo-file-system's classic API moved to the "/legacy" subpath in newer
// Expo SDKs (the root import now exports a different, non-compatible API).
// Resolve whichever one is actually available so this keeps working
// regardless of which SDK version is installed, instead of throwing an
// import error that — see the note below — would otherwise be silently
// swallowed and look like "nothing happens" when adding a photo.
async function getFileSystem() {
  try {
    return await import('expo-file-system/legacy');
  } catch {
    try {
      return await import('expo-file-system');
    } catch (e) {
      console.warn('[ProgressPhotos] expo-file-system unavailable', e);
      return null;
    }
  }
}

// Lightweight local hash for the Progress Photos privacy lock. This is a
// simple deterministic checksum, not a cryptographic hash — it exists only
// so the PIN isn't stored in plain text on-device, as a casual deterrent
// against someone else browsing the phone. It is NOT strong encryption and
// does not protect against someone with direct access to the device's
// storage/backups. Avoids pulling in a native crypto dependency (e.g.
// expo-crypto), which keeps this change safe to ship with limited builds
// remaining.
export function hashPin(pin) {
  const str = String(pin ?? '');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `h${hash}`;
}

export async function pickProgressPhoto(type) {
  if (Platform.OS === 'web') return null;
  try {
    const ImagePicker = await import('expo-image-picker');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions?.Images || ['images'], allowsEditing:true, quality:0.75 });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    // IMPORTANT: this must be awaited (not `return persistLocalPhoto(...)`).
    // Returning an un-awaited promise from inside a try block means any
    // rejection it produces surfaces AFTER this function has already
    // "returned", so the catch below never sees it — the error becomes an
    // unhandled promise rejection in whatever called pickProgressPhoto,
    // which silently disappears in a release build. That's what made the
    // picker look like it worked (crop/rotate showed fine) while nothing
    // was ever actually saved.
    return await persistLocalPhoto(result.assets[0].uri, type);
  } catch (e) { console.warn('[ProgressPhotos] picker failed', e); return null; }
}

export async function takeProgressPhoto(type) {
  if (Platform.OS === 'web') return null;
  try {
    const ImagePicker = await import('expo-image-picker');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
    const result = await ImagePicker.launchCameraAsync({ allowsEditing:true, quality:0.75 });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    // See the comment in pickProgressPhoto above — must await here too.
    return await persistLocalPhoto(result.assets[0].uri, type);
  } catch (e) { console.warn('[ProgressPhotos] camera failed', e); return null; }
}

// New predictable storage location: fittrack/progress-photos/{category}-{date}.jpg
// e.g. fittrack/progress-photos/front-2026-08-31.jpg
// Replaces the old progress_photos/{date}/ layout for NEW photos only.
// Existing photos already saved under the old layout are left exactly
// where they are and keep loading normally (see getFileSystem usage
// throughout this file, which just reads whatever `uri` is stored in each
// photo's metadata — old or new).
function progressPhotosDir(FileSystem) {
  return `${FileSystem.documentDirectory}fittrack/progress-photos/`;
}

async function persistLocalPhoto(uri, type) {
  const FileSystem = await getFileSystem();
  if (!FileSystem) return null;
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dir = progressPhotosDir(FileSystem);
  try { await FileSystem.makeDirectoryAsync(dir, { intermediates:true }); } catch (e) {
    console.warn('[ProgressPhotos] directory creation failed', e);
    return null;
  }

  // Optimize the copy before placing it in the permanent document directory.
  // The image-manipulator dependency is optional at runtime; if unavailable,
  // fall back to the original local copy so photo capture never breaks.
  let optimizedUri = uri;
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const manipulate = ImageManipulator.manipulateAsync || ImageManipulator.default?.manipulateAsync;
    if (manipulate) {
      const result = await manipulate(uri, [{ resize: { width: 1440 } }], {
        compress: 0.78,
        format: ImageManipulator.SaveFormat?.JPEG || 'jpeg',
      });
      optimizedUri = result?.uri || uri;
    }
  } catch {}

  // Predictable filename: {category}-{date}.jpg (e.g. front-2026-08-31.jpg,
  // chest-2026-08-31.jpg for a custom category). Filesystem-safe via
  // sanitizeCategoryKey. Collisions (e.g. a second front photo the same
  // day) are handled by appending -2, -3, etc. rather than silently
  // overwriting a photo the user already has.
  const categoryKey = sanitizeCategoryKey(type) || 'photo';
  const baseName = `${categoryKey}-${date}`;
  let filename = `${baseName}.jpg`;
  let dest = `${dir}${filename}`;
  try {
    let suffix = 2;
    while ((await FileSystem.getInfoAsync(dest))?.exists) {
      filename = `${baseName}-${suffix}.jpg`;
      dest = `${dir}${filename}`;
      suffix += 1;
      if (suffix > 50) break; // safety valve, extremely unlikely to be hit
    }
  } catch {
    // If existence checks themselves fail for some reason, fall back to a
    // timestamp-suffixed name so we still never silently clobber a file.
    filename = `${baseName}-${Date.now()}.jpg`;
    dest = `${dir}${filename}`;
  }
  try {
    await FileSystem.copyAsync({ from:optimizedUri, to:dest });
    if (optimizedUri !== uri) {
      try { await FileSystem.deleteAsync(optimizedUri, { idempotent:true }); } catch {}
    }
  } catch { return null; }
  return { uri:dest, type, date, weekKey: getWeekKey(date), localOnly: true };
}

// ---------------------------------------------------------------------------
// Restore-time helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a restored photo's referenced image file actually exists
 * on this device. Backups only ever contain metadata/paths, never the
 * image bytes themselves (see database.js#exportAllData) — this lets the
 * UI truthfully distinguish "metadata restored" from "image found" versus
 * "image missing" instead of assuming a successful metadata restore means
 * the photo itself came back.
 */
export async function checkProgressPhotoFileExists(uri) {
  if (!uri) return false;
  if (Platform.OS === 'web') return false;
  try {
    const FileSystem = await getFileSystem();
    if (!FileSystem) return false;
    const info = await FileSystem.getInfoAsync(uri);
    return !!info?.exists;
  } catch {
    return false;
  }
}

/**
 * Given a list of restored Progress Photo metadata rows, checks each one's
 * image file and returns the same rows annotated with `imageFound: boolean`.
 * Never mutates the input array or fabricates a "found" result — used right
 * after restore so the UI can clearly show which photos actually came back
 * versus which need to be copied over manually (see the folder path
 * returned by database.importAllData).
 */
export async function reconcileRestoredPhotos(photos = []) {
  const results = await Promise.all(
    (photos || []).map(async (p) => ({ ...p, imageFound: await checkProgressPhotoFileExists(p.uri) }))
  );
  return results;
}

/** Absolute on-device path of the Progress Photos folder, for display in the
 * restore UI (e.g. "copy this folder over when moving to a new device"). */
export async function getProgressPhotosFolderPath() {
  try {
    const FileSystem = await getFileSystem();
    if (!FileSystem) return null;
    return progressPhotosDir(FileSystem);
  } catch {
    return null;
  }
}


// ISO-week key used for the once-per-week progress-photo rule.
export function getWeekKey(dateString = null) {
  const base = dateString ? new Date(`${dateString}T00:00:00`) : new Date();
  const d = new Date(base);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + firstDay) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function getProgressPhotoStorageBytes() {
  try {
    const FileSystem = await getFileSystem();
    if (!FileSystem) return 0;
    const walk = async dir => {
      let total = 0;
      let names = [];
      try { names = await FileSystem.readDirectoryAsync(dir); } catch { return 0; }
      for (const name of names) {
        const uri = `${dir}${name}`;
        try {
          const info = await FileSystem.getInfoAsync(uri);
          if (info.isDirectory) total += await walk(`${uri}/`);
          else total += Number(info.size) || 0;
        } catch {}
      }
      return total;
    };
    // Sum both the old per-date layout and the new fittrack/progress-photos/
    // layout, since existing installs can have photos in either depending
    // on when they were taken.
    const [oldTotal, newTotal] = await Promise.all([
      walk(`${FileSystem.documentDirectory}progress_photos/`),
      walk(progressPhotosDir(FileSystem)),
    ]);
    return oldTotal + newTotal;
  } catch { return 0; }
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function deleteLocalPhoto(uri) {
  try { const FileSystem = await getFileSystem(); if (FileSystem) await FileSystem.deleteAsync(uri, { idempotent:true }); } catch {}
}

// ---------------------------------------------------------------------------
// Photo Archive — cross-device photo transfer
// ---------------------------------------------------------------------------
// WHY THIS EXISTS: the main .txt backup (see database.js#exportAllData)
// intentionally never contains image bytes — only metadata/paths. That's
// correct for the main backup, but it means restoring that .txt on a new
// device brings back photo *records* with no way to get the actual
// pictures there too, since `fittrack/progress-photos/` lives inside this
// app's private sandboxed storage. On iOS in particular, that folder is
// NOT browsable via the Files app or a cable/AirDrop transfer unless the
// app opts into file-sharing entitlements (a native config change), and on
// Android it's similarly awkward without extra permissions/UI. Asking the
// user to "just copy the folder over" mostly doesn't work in practice on a
// stock Expo app.
//
// So instead: a separate, OPT-IN "Photo Archive" export/import, built the
// same way the .txt backup already is (a JSON file the user shares/saves
// via the OS Share sheet, then opens on the new device with the same file
// picker used for backup restore) — except this one DOES contain the
// image bytes (base64-encoded), because moving the pictures is the whole
// point of it. It stays a separate, explicitly-requested action so the
// regular data backup/restore flow (which people may do often, e.g. before
// an update) remains small and fast and never accidentally includes image
// data. On restore, files are written back into the same predictable
// `fittrack/progress-photos/{category}-{date}.jpg` structure used for new
// photos, so everything — old and newly-arrived — lives in one place
// going forward.
// ---------------------------------------------------------------------------

const PHOTO_ARCHIVE_VERSION = 1;

/**
 * Builds a portable JSON archive of every progress photo whose image file
 * currently exists on this device (metadata-only entries, e.g. ones
 * already known to be missing, are skipped — there's nothing to archive).
 * Returns { json, includedCount, skippedCount } — never writes or shares
 * anything itself, so the caller controls if/where it gets saved.
 */
export async function buildPhotosArchive(photos = []) {
  const FileSystem = await getFileSystem();
  const entries = [];
  let skipped = 0;
  for (const p of photos) {
    if (!p?.uri) { skipped++; continue; }
    try {
      const info = FileSystem ? await FileSystem.getInfoAsync(p.uri) : null;
      if (!info?.exists) { skipped++; continue; }
      const base64 = await FileSystem.readAsStringAsync(p.uri, { encoding: FileSystem.EncodingType.Base64 });
      const filename = String(p.uri).split('/').pop() || `${sanitizeCategoryKey(p.type)}-${p.date}.jpg`;
      entries.push({ id: p.id, type: p.type, date: p.date, weekKey: p.weekKey, filename, base64 });
    } catch (e) {
      console.warn('[ProgressPhotos] archive: failed to read', p?.uri, e);
      skipped++;
    }
  }
  const json = JSON.stringify({
    __kind: 'fittrack-progress-photos-archive',
    __version: PHOTO_ARCHIVE_VERSION,
    __exported: new Date().toISOString(),
    photos: entries,
  });
  return { json, includedCount: entries.length, skippedCount: skipped };
}

/** Quick check so the restore UI can tell a Photo Archive apart from the
 * regular data backup .txt before attempting to import it as one or the
 * other. */
export function isPhotosArchiveJSON(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    return data?.__kind === 'fittrack-progress-photos-archive';
  } catch { return false; }
}

/**
 * Restores a Photo Archive: writes each entry's image bytes back to
 * `fittrack/progress-photos/{filename}` and returns metadata rows the
 * caller should upsert into database.progressPhotos (merged by id — this
 * function only touches the filesystem, it does not know about app
 * storage/state). Existing files with the same name are left alone rather
 * than overwritten, so re-importing the same archive twice is safe.
 */
export async function restorePhotosArchive(jsonStr) {
  const data = JSON.parse(jsonStr);
  if (data?.__kind !== 'fittrack-progress-photos-archive' || !Array.isArray(data.photos)) {
    throw new Error('That file doesn\'t look like a FitTrack Photo Archive.');
  }
  const FileSystem = await getFileSystem();
  if (!FileSystem) throw new Error('File access isn\'t available in this build.');
  const dir = progressPhotosDir(FileSystem);
  try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch {}

  const restoredPhotos = [];
  let writtenCount = 0, alreadyPresentCount = 0, failedCount = 0;
  for (const entry of data.photos) {
    if (!entry?.base64 || !entry?.filename) { failedCount++; continue; }
    const dest = `${dir}${entry.filename}`;
    try {
      const info = await FileSystem.getInfoAsync(dest);
      if (!info?.exists) {
        await FileSystem.writeAsStringAsync(dest, entry.base64, { encoding: FileSystem.EncodingType.Base64 });
        writtenCount++;
      } else {
        alreadyPresentCount++;
      }
      restoredPhotos.push({
        id: entry.id || `${entry.type}_${entry.date}_${Date.now()}`,
        uri: dest,
        type: entry.type,
        date: entry.date,
        weekKey: entry.weekKey || getWeekKey(entry.date),
        localOnly: true,
      });
    } catch (e) {
      console.warn('[ProgressPhotos] archive: failed to write', entry.filename, e);
      failedCount++;
    }
  }
  return { restoredPhotos, writtenCount, alreadyPresentCount, failedCount, folder: dir };
}