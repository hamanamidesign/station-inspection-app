import { gasApi } from './gasApi';

// Download no more than two photos at once. Never open an editable partial result.
export async function loadPhotoKarte(params: Record<string, unknown>) {
  const result = await gasApi('getKarteData', { ...params, photoMode: 'references' });
  const data = result.data;
  if (!data || typeof data !== 'object') throw new Error('写真カルテの応答が不正です。');
  // Older GAS deployments return the original inline images.
  if (!Object.prototype.hasOwnProperty.call(data, 'photoSources')) return result;
  if (!Array.isArray(data.photoSources) || data.photoSources.length > 8) throw new Error('写真一覧の応答が不正です。');
  const sources = data.photoSources as { id: string; target: string; index: number }[];
  const slots = new Set<string>();
  for (const source of sources) {
    if (!source || typeof source.id !== 'string' || !source.id ||
        !['first', 'current'].includes(source.target) || !Number.isInteger(source.index) || source.index < 0 || source.index > 3 ||
        slots.has(source.target + ':' + source.index)) throw new Error('写真番号の応答が不正です。');
    slots.add(source.target + ':' + source.index);
  }
  const photos = Array<string | null>(4).fill(null);
  const firstPhotos = Array<string | null>(4).fill(null);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < sources.length) {
      const source = sources[next++];
      try {
        const photo = await gasApi('getMapBase64', { id: source.id });
        const base64 = typeof photo.base64 === 'string' ? photo.base64.trim() : '';
        if (!base64 || !/^(?:data:image\/|\/9j\/|iVBORw0KGgo|R0lGOD|UklGR)/.test(base64)) throw new Error('画像データが不正または空です。');
        const url = base64.startsWith('data:image/') ? base64 : 'data:' + (photo.mimeType || 'image/jpeg') + ';base64,' + base64;
        (source.target === 'first' ? firstPhotos : photos)[source.index] = url;
      } catch (error) {
        failed = true;
        throw new Error((source.target === 'first' ? '初回' : '今回') + '写真' + (source.index + 1) + 'の取得に失敗しました。 ' + (error instanceof Error ? error.message : String(error)));
      }
    }
  };
  const downloads = await Promise.allSettled([worker(), worker()]);
  const failure = downloads.find(item => item.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return { ...result, data: { ...data, photos, firstPhotos } };
}
