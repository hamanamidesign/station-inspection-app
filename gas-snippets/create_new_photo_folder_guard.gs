// createNew の写真保存エリア二重作成対策スニペットです。
// createNew(data) の中で「写真保存エリア」フォルダを作る箇所を、
// stationFolder.createFolder("写真保存エリア") ではなく
// getOrCreateStationPhotoFolder_(stationFolder) に差し替えてください。
//
// 例:
// const photoFolder = getOrCreateStationPhotoFolder_(stationFolder);
// const photoFolderId = photoFolder.getId();

function getOrCreateStationPhotoFolder_(stationFolder) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const folders = stationFolder.getFoldersByName("写真保存エリア");

    if (folders.hasNext()) {
      const folder = folders.next();

      // 既に重複している場合は、今後の参照が迷わないよう余分な方をリネームします。
      while (folders.hasNext()) {
        const duplicate = folders.next();
        duplicate.setName("写真保存エリア_重複_" + Utilities.formatDate(
          new Date(),
          Session.getScriptTimeZone(),
          "yyyyMMdd_HHmmss"
        ));
      }

      return folder;
    }

    return stationFolder.createFolder("写真保存エリア");
  } finally {
    lock.releaseLock();
  }
}
