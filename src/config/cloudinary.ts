import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

// Configures the Cloudinary SDK singleton at first import.
// Credentials are guaranteed present: env.ts validates them as boot-required
// (.min(1)) and exits the process if any is missing (mirrors payos.client.ts).
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

/**
 * Best-effort delete of a Cloudinary asset by public_id. Cleanup must never
 * fail the request, so any error is logged and swallowed. `resourceType` is
 * required and must match how the asset was uploaded ('image' vs 'video') —
 * Cloudinary namespaces by resource type, so a mismatch silently "not founds".
 */
export const destroyAsset = async (
  publicId: string,
  resourceType: 'image' | 'video',
): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
  } catch (err) {
    console.error(
      `[destroyAsset] Failed to delete ${resourceType} ${publicId}:`,
      err,
    );
  }
};
