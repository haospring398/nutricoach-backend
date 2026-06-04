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
