::wavedoc
---
title: Upload File
description: |
  The Upload File node uploads a file from the machine the Agent runs on into Iconik as a new asset and returns the asset's ID. It does every step Iconik needs for an upload: it finds the storage to upload to, creates the asset with an ORIGINAL format, a file set and a file record, sends the file's bytes straight to the storage, marks the file as complete and, unless Generate Proxies is disabled, starts the Iconik job that creates the proxy and keyframes. The node does not wait for that job to finish. It uploads to Google Cloud Storage, Amazon S3 and Azure storages; files over 100 MB go to Azure in parts, and to S3 in parts when Iconik provides a multipart upload URL for the file; a part that fails because the storage cannot be reached or answers 429 or 5xx is tried again, up to 3 attempts. Every run creates a new asset; the node does not check whether the file was uploaded before. When the upload fails after the asset was created, the node moves that asset to Iconik's delete queue so no empty asset is left behind; it can still be restored there. It authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_read_storages, can_create_assets, can_write_formats and can_write_files roles, can_create_transcode_jobs for the proxy job, and can_delete_assets to remove the new asset after a failed upload. The progress bar shows how much of the file has been sent.
inputs:
  - name: App ID
    description: |
      Enter the app ID for the Iconik API. Leading and trailing spaces are removed. Replaced by a placeholder in the Curl output
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: App ID
        value: "example-app-id"
  - name: Auth Token
    description: |
      Enter the auth token for the Iconik API that belongs to the App ID. Leading and trailing spaces are removed. Replaced by a placeholder in the Curl output and in error messages
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: Auth Token
        value: "example-auth-token"
  - name: File Path
    description: |
      Enter the absolute path of the file to upload, as the machine the Agent runs on sees it. It must be a single readable file, not a folder. Leading and trailing spaces are removed
    type: STRING
    mandatory: true
    example:
      - name: File Path
        value: "/Volumes/Media/Interview_Raw_01.mov"
  - name: Asset Title
    description: |
      Enter the title of the new asset. Leave it empty to use the file name, including its extension
    type: STRING
    mandatory: false
    example:
      - name: Asset Title
        value: "Interview Raw 01"
  - name: Collection ID
    description: |
      Enter the ID of a collection to place the new asset in, for example from the Create Collection node. It must be a UUID; leave it empty to create the asset outside any collection
    type: STRING
    mandatory: false
    example:
      - name: Collection ID
        value: "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
  - name: Generate Proxies
    description: |
      Enable to have Iconik create the proxy and keyframes once the file is uploaded, so the asset can be previewed in Iconik. Enabled by default. When the storage's transcode ignore pattern matches the file, Iconik starts no job and Transcode job ID stays empty
    type: BOOLEAN
    mandatory: false
    example:
      - name: Generate Proxies
        value: true
  - name: Iconik URL
    description: |
      Enter the base URL of the Iconik instance, starting with http:// or https://. Leave it empty to use https://app.iconik.io, the default. Trailing slashes are removed
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Iconik URL
        value: "https://app.iconik.io"
  - name: Storage ID
    description: |
      Enter the ID of the Iconik storage to upload to. It must be a UUID and a Google Cloud Storage, Amazon S3 or Azure storage. Leave it empty to use the storage Iconik picks for new files
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Storage ID
        value: "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d"
  - name: Apply Default ACLs
    description: |
      Enable to give the new asset the default access rights configured in Iconik. Enabled by default
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Apply Default ACLs
        value: true
outputs:
  - name: Asset ID
    description: |
      Returns the ID Iconik gave the new asset. Wire it into Set Metadata, Get Asset or Add to Collection. Stays empty when the node fails
    type: STRING
    example:
      - name: Asset ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: File ID
    description: |
      Returns the ID of the uploaded file in Iconik. Stays empty when the node fails
    type: STRING
    example:
      - name: File ID
        value: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a"
  - name: Format ID
    description: |
      Returns the ID of the ORIGINAL format the file belongs to. Stays empty when the node fails
    type: STRING
    example:
      - name: Format ID
        value: "8e9f0a1b-2c3d-4e5f-8a6b-7c8d9e0f1a2b"
  - name: Transcode job ID
    description: |
      Returns the ID of the Iconik job that creates the proxy and keyframes. Empty when Generate Proxies is disabled or the storage's transcode ignore pattern skipped the file
    type: STRING
    example:
      - name: Transcode job ID
        value: "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d"
  - name: File size
    description: |
      Returns the size of the uploaded file in bytes. Stays empty when the node fails
    type: NUMBER
    example:
      - name: File size
        value: 524288000
  - name: Asset
    description: |
      Returns the asset object Iconik created, with fields such as id, title, type and status. Stays empty when the node fails
    type: JSON
    example:
      - name: Asset
        value: |
          {
            "id": "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            "title": "Interview Raw 01",
            "type": "ASSET",
            "status": "ACTIVE"
          }
  - name: File
    description: |
      Returns the file record Iconik holds for the upload after it was marked complete, with fields such as id, original_name, size and status. The signed upload URLs and storage credentials in Iconik's answer are removed. Stays empty when the node fails
    type: JSON
    example:
      - name: File
        value: |
          {
            "id": "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
            "original_name": "Interview_Raw_01.mov",
            "size": 524288000,
            "status": "CLOSED",
            "storage_method": "GCS"
          }
  - name: Curl
    description: |
      Returns every request sent to Iconik as curl commands, separated by a blank line, with placeholders in place of the App ID and Auth Token. The requests to the storage itself are left out, because their signed URLs give access to the storage. Each request is added before it is sent, so the output also shows the request that failed
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X GET \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/files/v1/storages/matching/FILES/"
connectors:
  - name: Success
    description: |
      Triggered when the file is uploaded and marked complete in Iconik and, when Generate Proxies is enabled, the proxy job was started
  - name: Fail
    description: |
      Triggered when an input check fails, the storage cannot be used, or a step of the upload fails. When an input check fails, nothing is sent to Iconik. When the upload fails after the asset was created, the message ends with whether the asset was moved to the delete queue. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If File Path is empty, not absolute, does not exist, is a folder or cannot be read, or Collection ID or Storage ID is set but not a UUID
      - name: Unsupported Storage
        description: |
          If the storage to upload to is not ACTIVE in Iconik, is not a Google Cloud Storage, Amazon S3 or Azure storage, or Iconik returns no upload URL for it. Nothing is created in Iconik when the storage is not active or its method is not supported
      - name: Storage Not Found
        description: |
          If Iconik answers 404 when looking up the storage: Storage ID does not exist, or no default file storage is set up when Storage ID is empty
      - name: Storage Rejected Upload
        description: |
          If the storage answers with a non-2xx status while the file is sent, for example because its credentials or permissions in Iconik are wrong. The message shows the storage's error code and text, never the signed URL
      - name: Request Rejected
        description: |
          If Iconik answers 400 to one of the upload steps. The message shows Iconik's reason unchanged
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403, for example when a required role is missing
      - name: Proxy Job Failed
        description: |
          If the file was uploaded but Iconik does not start the proxy job. The asset is kept and the message names its ID
      - name: Rate Limited
        description: |
          If Iconik still answers 429 on the third attempt of a request
      - name: Connection Error
        description: |
          If the Iconik URL is not a valid http:// or https:// URL, Iconik or the storage cannot be reached, or Iconik does not answer within 30 seconds
      - name: Canceled
        description: |
          If the stream is canceled while the file is being sent. The new asset is moved to the delete queue
      - name: API Error
        description: |
          If Iconik answers with any other non-2xx status, or returns the new asset without an ID
---
::
