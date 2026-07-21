const BUCKET = 'listing-media';
const MAX_IMAGE_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

function supabaseHeaders(config, contentType) {
  const headers = {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

function requireSupabase(config) {
  if (!config.supabaseUrl?.trim() || !config.supabaseAnonKey?.trim()) {
    throw new Error('Add Supabase URL and anon key in Settings (and save config.json to GitHub).');
  }
}

function compressImageFile(file, maxWidth = MAX_IMAGE_WIDTH, quality = JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Image compress failed'));
              return;
            }
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function publicObjectUrl(config, path) {
  return `${config.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Upload an image or video file to Supabase Storage (public bucket).
 * Returns a public HTTPS URL visible to all website visitors.
 */
export async function uploadListingMedia(file, config, { apartmentId = 'misc' } = {}) {
  requireSupabase(config);

  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');
  if (!isImage && !isVideo) {
    throw new Error('Only image or video files are supported');
  }

  if (isVideo && file.size > 50 * 1024 * 1024) {
    throw new Error('Video must be under 50MB');
  }

  const prepared = isImage ? await compressImageFile(file) : file;
  const ext = prepared.name.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg');
  const path = `${apartmentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const res = await fetch(
    `${config.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        ...supabaseHeaders(config, prepared.type || 'application/octet-stream'),
        'x-upsert': 'true',
      },
      body: prepared,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404 || text.includes('Bucket not found')) {
      throw new Error('Storage bucket missing. Run scripts/supabase-setup.sql in Supabase SQL Editor.');
    }
    throw new Error(`Upload failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return {
    url: publicObjectUrl(config, path),
    type: isVideo ? 'video' : 'image',
  };
}

export async function uploadManyMedia(files, config, options = {}) {
  const results = [];
  const list = Array.from(files);
  for (let i = 0; i < list.length; i++) {
    options.onProgress?.(`Uploading ${i + 1}/${list.length}…`);
    results.push(await uploadListingMedia(list[i], config, options));
  }
  return results;
}

export function apartmentMedia(apartment) {
  if (Array.isArray(apartment.media) && apartment.media.length) {
    return apartment.media.filter((m) => m?.url);
  }
  const list = [];
  if (Array.isArray(apartment.images)) {
    apartment.images.filter(Boolean).forEach((url) => list.push({ type: 'image', url }));
  }
  if (apartment.imageUrl) {
    if (!list.some((m) => m.url === apartment.imageUrl)) {
      list.unshift({ type: 'image', url: apartment.imageUrl });
    }
  }
  if (apartment.videoUrl) {
    list.push({ type: 'video', url: apartment.videoUrl });
  }
  return list;
}

export function coverImageUrl(apartment) {
  const media = apartmentMedia(apartment);
  const image = media.find((m) => m.type === 'image');
  return image?.url || apartment.imageUrl || '';
}
