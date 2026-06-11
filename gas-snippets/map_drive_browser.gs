// 写真カルテ番号位置図: Googleドライブのフォルダを移動しながら画像を選択するための関数です。
// doGet / doPost の getMaps から handleGetMaps(folderId, routeName) を呼び出してください。
//
// doGet:
//   case "getMaps":
//     return handleGetMaps(e.parameter.folderId, e.parameter.routeName);
//
// doPost:
//   case "getMaps":
//     return handleGetMaps(body.folderId, body.routeName);

function handleGetMaps(folderId, routeName) {
  const folder = getMapFolder_(folderId, routeName);
  const parent = getMapParentFolder_(folder);
  const folders = [];
  const files = [];

  const folderIterator = folder.getFolders();
  while (folderIterator.hasNext()) {
    const child = folderIterator.next();
    folders.push({
      id: child.getId(),
      name: child.getName(),
    });
  }

  const fileIterator = folder.getFiles();
  while (fileIterator.hasNext()) {
    const file = fileIterator.next();
    if (String(file.getMimeType()).indexOf("image/") === 0) {
      files.push({
        id: file.getId(),
        name: file.getName(),
        thumbUrl: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w300",
      });
    }
  }

  folders.sort(function(a, b) {
    return String(a.name).localeCompare(String(b.name), "ja");
  });

  files.sort(function(a, b) {
    return String(a.name).localeCompare(String(b.name), "ja");
  });

  return createJsonResponse({
    success: true,
    currentFolder: {
      id: folder.getId(),
      name: folder.getName(),
    },
    parentFolder: parent
      ? {
          id: parent.getId(),
          name: parent.getName(),
        }
      : null,
    folders: folders,
    list: files,
  });
}

function getMapFolder_(folderId, routeName) {
  const id = String(folderId || "").trim();

  if (id === "root") {
    return DriveApp.getRootFolder();
  }

  if (id) {
    return DriveApp.getFolderById(id);
  }

  const routeFolder = findMapRouteFolder_(routeName);
  return routeFolder || DriveApp.getFolderById(CONFIG.MAP_FOLDER_ID);
}

function findMapRouteFolder_(routeName) {
  const targetName = normalizeMapFolderName_(routeName);
  if (!targetName) return null;

  const root = DriveApp.getFolderById(CONFIG.MAP_FOLDER_ID);
  const folders = root.getFolders();

  while (folders.hasNext()) {
    const folder = folders.next();
    if (normalizeMapFolderName_(folder.getName()) === targetName) {
      return folder;
    }
  }

  return null;
}

function normalizeMapFolderName_(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function getMapParentFolder_(folder) {
  const parents = folder.getParents();
  return parents.hasNext() ? parents.next() : null;
}
