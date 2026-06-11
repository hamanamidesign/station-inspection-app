// 既存の getRouteList() をこの内容に差し替えてください。
// ルートフォルダ走査は遅くなることがあるため、5分間キャッシュします。
// 路線はフォルダ作成日の古い順に並べます。

function getRouteList() {
  const cache = CacheService.getScriptCache();
  const cacheKey = "route_list_v2";
  const cached = cache.get(cacheKey);

  if (cached) {
    return {
      success: true,
      list: JSON.parse(cached),
      cached: true,
    };
  }

  const ROOT_FOLDER_ID = "1L_a6as-Wxc-BOOojkLo7BDtbx2wSZT30";
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const folders = root.getFolders();
  const list = [];

  while (folders.hasNext()) {
    const folder = folders.next();
    const name = folder.getName();

    if (name.indexOf("駅構内点検_") === 0) {
      list.push({
        name: name.replace("駅構内点検_", ""),
        folderId: folder.getId(),
        createdAt: folder.getDateCreated().toISOString(),
      });
    }
  }

  list.sort((a, b) => {
    const dateDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return dateDiff || String(a.name).localeCompare(String(b.name), "ja");
  });
  cache.put(cacheKey, JSON.stringify(list), 300);

  return {
    success: true,
    list: list,
    cached: false,
  };
}
