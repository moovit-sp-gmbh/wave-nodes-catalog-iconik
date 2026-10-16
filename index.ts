import Catalog from "./lib/Catalog";
import DeleteAsset from "./lib/nodes/iconikAssets/DeleteAsset";
import GetAsset from "./lib/nodes/iconikAssets/GetAsset";
import UpdateAsset from "./lib/nodes/iconikAssets/UpdateAsset";
import AddToCollection from "./lib/nodes/iconikCollections/AddToCollection";
import CreateCollection from "./lib/nodes/iconikCollections/CreateCollection";
import ListCollectionContents from "./lib/nodes/iconikCollections/ListCollectionContents";
import GetOriginalDownloadUrl from "./lib/nodes/iconikFiles/GetOriginalDownloadUrl";
import UploadFile from "./lib/nodes/iconikFiles/UploadFile";
import GetMetadata from "./lib/nodes/iconikMetadata/GetMetadata";
import SetMetadata from "./lib/nodes/iconikMetadata/SetMetadata";
import Search from "./lib/nodes/iconikSearch/Search";

export default new Catalog(
    "Iconik",
    "Upload, read, update and delete assets, set metadata, search, organize collections and get original download links in Iconik",
    "https://app.helmut.cloud/img/logo_white.webp",
    "2.0.1",
    GetAsset,
    UpdateAsset,
    DeleteAsset,
    GetMetadata,
    SetMetadata,
    Search,
    CreateCollection,
    AddToCollection,
    ListCollectionContents,
    GetOriginalDownloadUrl,
    UploadFile
);
