const BUCKET = 'listing-media';
/** Max long edge in pixels — enough for cards, much smaller uploads */
const MAX_IMAGE_EDGE = 1000;
/** JPEG quality 0–1 (lower = smaller files) */
const JPEG_QUALITY = 0.62;
/** Soft cap after compress; re-encode harder if still over this */
const MAX_IMAGE_BYTES = 350 * 1024; // ~350 KB

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

function drawToJpegBlob(img, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Image compress failed'));
        else resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

function compressImageFile(file, maxEdge = MAX_IMAGE_EDGE, quality = JPEG_QUALITY) {
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
      img.onload = async () => {
        try {
          let edge = maxEdge;
          let q = quality;
          let blob = await drawToJpegBlob(img, edge, q);

          // Second pass if still large
          if (blob.size > MAX_IMAGE_BYTES) {
            edge = Math.min(edge, 800);
            q = Math.min(q, 0.5);
            blob = await drawToJpegBlob(img, edge, q);
          }
          if (blob.size > MAX_IMAGE_BYTES) {
            edge = Math.min(edge, 640);
            q = Math.min(q, 0.42);
            blob = await drawToJpegBlob(img, edge, q);
          }

          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        } catch (err) {
          reject(err);
        }
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

  if (isVideo && file.size > 15 * 1024 * 1024) {
    throw new Error('Video must be under 15MB (keep clips short to save storage)');
  }

  const prepared = isImage ? await compressImageFile(file) : file;
  if (isImage && prepared.size > 800 * 1024) {
    throw new Error('Photo is still too large after compression. Try a smaller image.');
  }
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
